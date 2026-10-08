import crypto from "crypto";
import mongoose from "mongoose";

import { getAuth } from "firebase-admin/auth";

import { app } from "../configs/firebase.js";
import { PRICES, CLIENT_CHARGEABLE_ACTIONS } from "../configs/pricing.js";
import User from "../model/user.model.js";
import CoinTransaction from "../model/coinTransaction.model.js";
import redis from "../../../shared/redis/redis.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

// The session holds identity only. The coin balance is NOT cached here any
// more: it lives in MongoDB and is read fresh by /me, so it can never go
// stale across devices or after a service charges coins.
const sessionPayload = (user) =>
  JSON.stringify({
    userId: user._id,
    name: user.name,
    email: user.email,
  });

const publicUser = (user) => ({
  userId: user._id,
  name: user.name,
  email: user.email,
  interviewCoin: user.interviewCoin,
});

const readSession = async (req) => {
  const sessionId = req.cookies?.session;
  if (!sessionId) return null;
  const raw = await redis.get(`session:${sessionId}`);
  return raw ? JSON.parse(raw) : null;
};

const isDuplicateKey = (error) => error?.code === 11000;

class CoinError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const sendCoinError = (res, error) => {
  if (error instanceof CoinError) {
    return res
      .status(error.status)
      .json({ success: false, message: error.message, ...error.extra });
  }
  console.log(error);
  return res.status(500).json({ success: false, message: error.message });
};

// ---------------------------------------------------------------------------
// Ledger operations. Each one writes the ledger entry first (unique
// `reference`), then moves the balance with a single atomic update. A replay
// of the same reference is detected by the unique index and changes nothing.
// ---------------------------------------------------------------------------

const chargeCoins = async ({ userId, action, reference }) => {
  const price = PRICES[action];
  if (!price) throw new CoinError(400, `Unknown action: ${action}`);
  if (!mongoose.isValidObjectId(userId)) throw new CoinError(400, "Invalid userId");

  try {
    await CoinTransaction.create({ userId, type: "debit", action, amount: price, reference });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const user = await User.findById(userId);
      return { interviewCoin: user?.interviewCoin, alreadyApplied: true };
    }
    throw error;
  }

  // Atomic check-and-decrement: two concurrent charges can never both pass.
  const user = await User.findOneAndUpdate(
    { _id: userId, interviewCoin: { $gte: price } },
    { $inc: { interviewCoin: -price } },
    { new: true }
  );

  if (!user) {
    await CoinTransaction.deleteOne({ reference });
    const exists = await User.findById(userId);
    if (!exists) throw new CoinError(404, "User not found");
    throw new CoinError(402, "Not enough interview coins", {
      interviewCoin: exists.interviewCoin,
      required: price,
    });
  }

  return { interviewCoin: user.interviewCoin, charged: price };
};

const refundCoins = async ({ userId, reference }) => {
  const debit = await CoinTransaction.findOne({ reference, userId, type: "debit" });
  if (!debit) throw new CoinError(404, "No matching charge to refund");

  try {
    await CoinTransaction.create({
      userId,
      type: "refund",
      action: debit.action,
      amount: debit.amount,
      reference: `refund:${reference}`,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const user = await User.findById(userId);
      return { interviewCoin: user?.interviewCoin, alreadyApplied: true };
    }
    throw error;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { interviewCoin: debit.amount } },
    { new: true }
  );
  return { interviewCoin: user?.interviewCoin, refunded: debit.amount };
};

const creditCoins = async ({ userId, coins, action, reference }) => {
  const amount = Number(coins);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CoinError(400, "coins must be a positive integer");
  }
  if (!mongoose.isValidObjectId(userId)) throw new CoinError(400, "Invalid userId");

  try {
    await CoinTransaction.create({ userId, type: "credit", action, amount, reference });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const user = await User.findById(userId);
      return { interviewCoin: user?.interviewCoin, alreadyApplied: true };
    }
    throw error;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { interviewCoin: amount } },
    { new: true }
  );

  if (!user) {
    await CoinTransaction.deleteOne({ reference });
    throw new CoinError(404, "User not found");
  }

  return { interviewCoin: user.interviewCoin, credited: amount };
};

// ---------------------------------------------------------------------------
// Public routes (reached through the gateway at /api/auth/*)
// ---------------------------------------------------------------------------

export const login = async (req, res) => {
  try {
    const { token } = req.body;

    const decoded = await getAuth(app).verifyIdToken(token);

    let user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      user = await User.create({
        firebaseUid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
      });
    }

    const sessionId = crypto.randomUUID();

    await redis.set(`session:${sessionId}`, sessionPayload(user), "EX", SESSION_TTL_SECONDS);

    res.cookie("session", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 1000 * SESSION_TTL_SECONDS,
    });

    return res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.log(error);
    return res.status(401).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const sessionId = req.cookies?.session;

    if (sessionId) {
      await redis.del(`session:${sessionId}`);
    }

    res.clearCookie("session", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });

    return res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Current user with a fresh coin balance. The gateway serves /api/me from here.
export const me = async (req, res) => {
  try {
    const session = await readSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Session expired" });
    }

    const user = await User.findById(session.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Browser-initiated charge. Only for actions that never reach a backend
// service (PDF download). The price comes from the server; any `coins` value
// in the body is ignored.
export const useInterviewCoins = async (req, res) => {
  try {
    const session = await readSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "Session expired" });
    }

    const { action } = req.body;

    if (!CLIENT_CHARGEABLE_ACTIONS.has(action)) {
      return res.status(400).json({
        success: false,
        message: "This action is charged by the service that performs it",
      });
    }

    const result = await chargeCoins({
      userId: session.userId,
      action,
      reference: `debit:${crypto.randomUUID()}`,
    });

    return res.status(200).json({ success: true, action, interviewCoin: result.interviewCoin });
  } catch (error) {
    return sendCoinError(res, error);
  }
};

// ---------------------------------------------------------------------------
// Internal routes (service-to-service only, guarded by requireInternalKey)
// ---------------------------------------------------------------------------

export const internalCharge = async (req, res) => {
  try {
    const { userId, action, reference } = req.body;
    if (!reference) {
      return res.status(400).json({ success: false, message: "reference is required" });
    }
    const result = await chargeCoins({ userId, action, reference });
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendCoinError(res, error);
  }
};

export const internalRefund = async (req, res) => {
  try {
    const { userId, reference } = req.body;
    if (!reference) {
      return res.status(400).json({ success: false, message: "reference is required" });
    }
    const result = await refundCoins({ userId, reference });
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendCoinError(res, error);
  }
};

export const internalCredit = async (req, res) => {
  try {
    const { userId, coins, action = "purchase", reference } = req.body;
    if (!reference) {
      return res.status(400).json({ success: false, message: "reference is required" });
    }
    const result = await creditCoins({ userId, coins, action, reference });
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendCoinError(res, error);
  }
};

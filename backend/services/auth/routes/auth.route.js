import express from "express";
import {
  internalCharge,
  internalCredit,
  internalRefund,
  login,
  logout,
  me,
  useInterviewCoins,
} from "../controllers/auth.controller.js";
import { requireInternalKey } from "../middleware/requireInternalKey.js";

const authRouter = express.Router();

// Public (via gateway /api/auth/*)
authRouter.post("/login", login);
authRouter.get("/logout", logout);
authRouter.get("/me", me);
authRouter.post("/use-coins", useInterviewCoins);

// Internal (other backend services only). There is deliberately no public
// "add coins" route: coins are only ever credited by the billing service
// after it has verified a Razorpay payment.
authRouter.post("/internal/charge", requireInternalKey, internalCharge);
authRouter.post("/internal/refund", requireInternalKey, internalRefund);
authRouter.post("/internal/credit", requireInternalKey, internalCredit);

export default authRouter;

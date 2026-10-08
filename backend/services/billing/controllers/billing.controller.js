import razorpay from "../configs/razorpay.js";
import Billing from "../models/billing.model.js";
import crypto from "crypto"
import { creditCoins, sendCoinError, CoinServiceError } from "../../../shared/coins/coins.js";



const PLANS = {
    starter: {
        amount: 199,
        interviewCoins: 300,
    },
};

const signaturesMatch = (expectedHex, providedHex) => {
    const a = Buffer.from(String(expectedHex))
    const b = Buffer.from(String(providedHex || ""))
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export const createOrder = async (req, res) => {
    try {
        const { planId } = req.body
        const userId = req.headers["x-user-id"]
        const plan = PLANS[planId]

        if (!plan) {
            return res.status(400).json({
                success: false,
                message: "Invalid plan",
            });
        }

        const order = await razorpay.orders.create({
            amount: plan.amount * 100,
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
        })

        await Billing.create({
            userId,
            amount: plan.amount,
            interviewCoins: plan.interviewCoins,
            razorpayOrderId: order.id,
            status: "created",
        })

        return res.status(201).json({
            success: true,
            order,
        })

    } catch (error) {
        console.log(error)
        return res.status(500).json({
            success: false,
            message: "Failed to create order",
        });
    }
}

// Verifies the Razorpay signature and, only then, credits the coins.
// Safe to call more than once for the same order: the status update is
// conditional and the credit is idempotent on the order id.
export const verifyPayment = async (req, res) => {
    try {
        const userId = req.headers["x-user-id"]

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Payment details are required",
            });
        }

        // The order must belong to the user who is verifying it.
        const payment = await Billing.findOne({
            razorpayOrderId: razorpay_order_id,
            userId,
        })

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found",
            });
        }

        const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex")

        if (!signaturesMatch(expected, razorpay_signature)) {
            if (payment.status === "created") {
                payment.status = "failed";
                await payment.save()
            }
            return res.status(400).json({
                success: false,
                message: "Payment verification failed",
            });
        }

        if (payment.status !== "paid") {
            await Billing.updateOne(
                { _id: payment._id, status: { $ne: "paid" } },
                {
                    status: "paid",
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                }
            )
        }

        // Credit server-side. The amount comes from the order record that was
        // created with the plan, never from the browser.
        const credit = await creditCoins(
            userId,
            payment.interviewCoins,
            `order:${payment.razorpayOrderId}`
        )

        if (!payment.coinsCredited) {
            await Billing.updateOne({ _id: payment._id }, { coinsCredited: true })
        }

        return res.status(200).json({
            success: true,
            message: credit.alreadyApplied ? "Payment already verified" : "Payment successful",
            interviewCoin: credit.interviewCoin,
        });
    } catch (error) {

        console.log(error);

        // The payment is recorded as paid; the credit can be retried safely by
        // calling /verify again with the same details.
        if (error instanceof CoinServiceError) {
            return sendCoinError(res, error);
        }

        return res.status(500).json({
            success: false,
            message: "Payment verification failed",
        });

    }
}

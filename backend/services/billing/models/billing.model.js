import mongoose from "mongoose";

const billingSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },

    interviewCoins: {
      type: Number,
      required: true,
    },

    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,

    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created",
    },

    // Set once the auth service has credited the coins for this order.
    coinsCredited: {
      type: Boolean,
      default: false,
    },
},{timestamps:true})


const Billing = mongoose.model("Billing",billingSchema)


export default Billing
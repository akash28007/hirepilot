import mongoose from "mongoose";

// Append-only ledger of every coin movement.
// `reference` is unique, which makes credits and refunds idempotent:
// replaying the same payment or refund hits a duplicate-key error instead of
// adding coins twice.
const coinTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["debit", "credit", "refund"],
      required: true,
    },

    action: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    reference: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

const CoinTransaction = mongoose.model("CoinTransaction", coinTransactionSchema);

export default CoinTransaction;

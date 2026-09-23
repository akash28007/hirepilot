import { initializeApp, cert } from "firebase-admin/app";
import dotenv from "dotenv";

dotenv.config();

let serviceAccount;

// Load Firebase service account from environment variable first (recommended for production)
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } catch (error) {
    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT_KEY environment variable:", error.message);
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY format. Must be valid JSON.");
  }
} else {
  // Fallback to loading from file (for development/migration period)
  // WARNING: Never commit serviceAccountKey.json to version control
  try {
    const { default: accountKey } = await import("../serviceAccountKey.json", { with: { type: "json" } });
    serviceAccount = accountKey;
    console.warn(
      "⚠️  WARNING: Loading Firebase service account from file. For production, use FIREBASE_SERVICE_ACCOUNT_KEY environment variable."
    );
  } catch (error) {
    throw new Error(
      `Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT_KEY environment variable or provide serviceAccountKey.json. Underlying error: ${error.message}`
    );
  }
}

export const app = initializeApp({
  credential: cert(serviceAccount),
});
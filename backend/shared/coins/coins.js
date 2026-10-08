import crypto from "crypto"

// Client for the auth service's coin ledger, used by the services that do
// paid work (resume, interview, roadmap). The service that runs the LLM is the
// one that charges: charge before the work, refund if the work fails.
//
// Uses only Node built-ins (global fetch, crypto) so backend/shared needs no
// dependencies of its own. Env vars are read at call time, after each
// service's dotenv.config() has run.

export class CoinServiceError extends Error {
    constructor(status, message, data = {}) {
        super(message)
        this.status = status
        this.data = data
    }
}

const callAuth = async (path, body) => {
    const base = process.env.AUTH_SERVICE_URL
    const key = process.env.INTERNAL_API_KEY

    if (!base || !key) {
        throw new CoinServiceError(503, "AUTH_SERVICE_URL and INTERNAL_API_KEY must be set")
    }

    let response
    try {
        response = await fetch(`${base}${path}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-internal-key": key,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5000),
        })
    } catch {
        throw new CoinServiceError(503, "Coin service is unavailable. Please try again.")
    }

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
        throw new CoinServiceError(response.status, data.message || "Coin service error", data)
    }

    return data
}

// Charges the server-side price for `action`. Throws CoinServiceError(402)
// when the balance is too low. Returns the reference needed to refund.
export const chargeCoins = async (userId, action) => {
    const reference = `debit:${crypto.randomUUID()}`
    const data = await callAuth("/internal/charge", { userId, action, reference })
    return { reference, interviewCoin: data.interviewCoin }
}

// Refunds a previous charge. Idempotent on the auth side. Never throws: a
// failed refund is logged, and must not hide the original error from the user.
export const refundCoins = async (userId, reference) => {
    try {
        const data = await callAuth("/internal/refund", { userId, reference })
        return data.interviewCoin
    } catch (error) {
        console.log(`Refund failed for ${reference}: ${error.message}`)
        return null
    }
}

// Credits purchased coins. `reference` must be unique per payment (the
// Razorpay order id): the auth ledger ignores a second credit with the same
// reference, so retrying a verification can never add coins twice.
export const creditCoins = async (userId, coins, reference) => {
    const data = await callAuth("/internal/credit", { userId, coins, action: "purchase", reference })
    return { interviewCoin: data.interviewCoin, alreadyApplied: Boolean(data.alreadyApplied) }
}

export const sendCoinError =(res, error) =>
    res.status(error.status).json({
        success: false,
        message: error.message,
        interviewCoin: error.data?.interviewCoin,
        required: error.data?.required,
    })

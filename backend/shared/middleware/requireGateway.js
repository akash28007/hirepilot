import crypto from "crypto"

// Services trust the x-user-id header, so they must only accept requests that
// came through the gateway. The gateway attaches the shared INTERNAL_API_KEY
// as x-internal-key (and overwrites anything the browser sent). A request
// that reaches a service port directly, without the key, is rejected here.
export const requireGateway = (req, res, next) => {
    const expected = process.env.INTERNAL_API_KEY

    if (!expected) {
        return res.status(503).json({
            success: false,
            message: "INTERNAL_API_KEY is not configured",
        })
    }

    const provided = Buffer.from(String(req.headers["x-internal-key"] || ""))
    const secret = Buffer.from(expected)

    if (provided.length !== secret.length || !crypto.timingSafeEqual(provided, secret)) {
        return res.status(401).json({ success: false, message: "Unauthorized" })
    }

    if (!req.headers["x-user-id"]) {
        return res.status(401).json({ success: false, message: "Missing user context" })
    }

    next()
}

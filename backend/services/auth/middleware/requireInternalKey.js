import crypto from "crypto";

// Guards the service-to-service endpoints (/internal/*).
// Callers must send the shared INTERNAL_API_KEY in the x-internal-key header.
// The gateway refuses to proxy /api/auth/internal/* and strips this header
// from browser requests, so only other backend services can reach these routes.
export const requireInternalKey = (req, res, next) => {
  const expected = process.env.INTERNAL_API_KEY;

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "INTERNAL_API_KEY is not configured",
    });
  }

  const provided = req.headers["x-internal-key"] || "";
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  next();
};

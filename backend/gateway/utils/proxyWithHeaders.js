import proxy from "express-http-proxy"

// Proxy for protected services. Runs after isAuth, so srcReq.user is set.
// Always overwrites x-user-id and x-internal-key, so a browser cannot spoof
// either header: the service sees only what the gateway put there.
export const proxyWithHeaders = (serviceUrl, options = {}) => {
    return proxy(serviceUrl, {
        ...options,
        proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
            delete proxyReqOpts.headers["x-user-id"]
            delete proxyReqOpts.headers["x-internal-key"]

            if (srcReq.user) {
                proxyReqOpts.headers["x-user-id"] = String(srcReq.user.userId)
            }
            proxyReqOpts.headers["x-internal-key"] = process.env.INTERNAL_API_KEY || ""

            return proxyReqOpts
        },
    })
}

// Proxy for the public auth routes (login, logout, me, use-coins).
// Strips the internal headers so a browser can never forward them to auth.
export const publicProxy = (serviceUrl, options = {}) => {
    return proxy(serviceUrl, {
        ...options,
        proxyReqOptDecorator: (proxyReqOpts) => {
            delete proxyReqOpts.headers["x-user-id"]
            delete proxyReqOpts.headers["x-internal-key"]
            return proxyReqOpts
        },
    })
}

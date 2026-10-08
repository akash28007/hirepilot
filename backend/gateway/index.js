import express from "express"
import dotenv from "dotenv"
dotenv.config()
import cors from "cors"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import { isAuth } from "./middleware/isAuth.js"
import { proxyWithHeaders, publicProxy } from "./utils/proxyWithHeaders.js"
const app = express()
app.use(express.json())

app.use(cors({
    origin:process.env.FRONTEND_URL,
    credentials:true
}))

app.use(morgan("dev"))
app.use(cookieParser())

const PORT = process.env.PORT || 6000

if (!process.env.INTERNAL_API_KEY) {
    console.warn("WARNING: INTERNAL_API_KEY is not set. Services will reject proxied requests.")
}

app.get("/" , (req,res)=>{
    res.send("Hello from Gateway")
})

// Service-to-service routes on the auth service are never reachable from outside.
app.use("/api/auth/internal", (req, res) => {
    res.status(404).json({ success: false, message: "Not found" })
})

app.use("/api/auth" , publicProxy(process.env.AUTH_SERVICE_URL))
app.use("/api/resume" ,isAuth, proxyWithHeaders(process.env.RESUME_SERVICE_URL))
app.use("/api/interview",isAuth ,proxyWithHeaders(process.env.INTERVIEW_SERVICE_URL))
app.use("/api/roadmap",isAuth ,proxyWithHeaders(process.env.ROADMAP_SERVICE_URL))
app.use("/api/billing",isAuth ,proxyWithHeaders(process.env.BILLING_SERVICE_URL))

// Current user, with a fresh coin balance read from the auth service's database.
app.get("/api/me", isAuth, publicProxy(process.env.AUTH_SERVICE_URL, {
    proxyReqPathResolver: () => "/me",
}))

app.listen(PORT , ()=>{
    console.log(`Gateway Started on ${PORT}`)
})

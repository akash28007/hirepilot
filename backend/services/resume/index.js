import express from "express"
import dotenv from "dotenv"
import { connectDB } from "./config/db.js"
import resumeRouter from "./routes/resume.route.js"
import { requireGateway } from "../../shared/middleware/requireGateway.js"

dotenv.config()

const app = express()

app.use(express.json())


const PORT = process.env.PORT || 6002

app.get("/" , (req,res)=>{
    res.send("Hello from Resume-service")
})

// Everything below the health check must come through the gateway.
app.use(requireGateway)

app.use("/",resumeRouter)

// Multer errors (wrong file type, file too large) arrive here.
app.use((err, req, res, next) => {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400
    return res.status(status).json({ success: false, message: err.message })
})



app.listen(PORT , ()=>{
    console.log(`Resume-service Started on ${PORT}`)
    connectDB()
})
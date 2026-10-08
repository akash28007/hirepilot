import express from "express"
import dotenv from "dotenv"
import { connectDB } from "./configs/db.js"
import billingRouter from "./routes/billing.route.js"
import { requireGateway } from "../../shared/middleware/requireGateway.js"

dotenv.config()

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 6005

app.get("/",(req,res)=>{
    res.send("Hello from Billing-service")
})

// Everything below the health check must come through the gateway.
app.use(requireGateway)

app.use("/",billingRouter)

app.listen(PORT , ()=>{
    console.log(`Billing-service Started on ${PORT}`)
    connectDB()
    
})
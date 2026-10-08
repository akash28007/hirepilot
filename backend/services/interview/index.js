import express from "express"
import dotenv from "dotenv"
import { connectDB } from "./config/db.js"
import interviewRouter from "./routes/interview.route.js"
import { requireGateway } from "../../shared/middleware/requireGateway.js"
dotenv.config()

const app = express()

app.use(express.json())

const PORT = process.env.PORT || 6003

app.get("/" , (req,res)=>{
    res.send("Hello from Interview-service")
})


// Everything below the health check must come through the gateway.
app.use(requireGateway)

app.use("/",interviewRouter)


app.listen(PORT , ()=>{
    console.log(`Interview-service Started on ${PORT}`)
    connectDB()
})
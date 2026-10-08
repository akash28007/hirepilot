import express from "express"
import dotenv from "dotenv"
import { connectDB } from "./configs/db.js"
import roadmapRouter from "./routes/roadmap.route.js"
import { requireGateway } from "../../shared/middleware/requireGateway.js"
dotenv.config()

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 6004

app.get("/" , (req,res)=>{
    res.send("Hello from Roadmap-service")
})

// Everything below the health check must come through the gateway.
app.use(requireGateway)

app.use("/",roadmapRouter)

app.listen(PORT , ()=>{
    console.log(`Roadmap-service Started on ${PORT}`)
    connectDB()

})

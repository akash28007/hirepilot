// pdf ---> disk ---> charge coins ---> text ---> llm agent ---> JSON ---> MongoDB ---> Redis ---> delete pdf ---> response
// If anything after the charge fails, the coins are refunded.

import redis from "../../../shared/redis/redis.js";
import { chargeCoins, refundCoins, sendCoinError, CoinServiceError } from "../../../shared/coins/coins.js";
import { resumeAgent } from "../agents/resume.agent.js";
import extractText from "../config/pdf.js";
import Resume from "../models/resume.model.js";
import fs from "fs"

const RESUME_CACHE_TTL_SECONDS = 60 * 60 * 24;

// Only these keys from the LLM's JSON are stored. Anything else it returns
// (including keys like userId or _id) is ignored.
const ANALYSIS_FIELDS = [
    "name", "email", "phone", "summary", "skills", "projects", "education",
    "experience", "strengths", "weaknesses", "missingSkills", "suggestedRole",
    "score", "recommendations",
];

const pickAnalysis = (data) => {
    const picked = {};
    for (const key of ANALYSIS_FIELDS) {
        if (data?.[key] !== undefined) picked[key] = data[key];
    }
    const score = Number(picked.score);
    picked.score = Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0;
    return picked;
};

const removeUpload = (file) => {
    if (file) {
        try { fs.unlinkSync(file.path); } catch {}
    }
};

export const uploadResume = async (req,res) => {
    let charge = null;
    const userId = req.headers["x-user-id"];

    try {
        const file = req.file;
        if(!file){
            return res.status(400).json({
                success:false,
                message:"Resume PDF is required"
            })
        }

        // Charge only once the input is valid; refund below if the work fails.
        charge = await chargeCoins(userId, "resume-analysis");

        const resumeText = await extractText(file.path)

        if (!resumeText || !resumeText.trim()) {
            throw Object.assign(new Error("Could not read any text from this PDF. Scanned images are not supported."), { status: 422 });
        }

        const resumeData = pickAnalysis(await resumeAgent(resumeText))

        let resume = await Resume.findOne({userId})

        if(resume){
            Object.assign(resume,{
                ...resumeData,
                extractedText:resumeText
            })
            await resume.save()
        }else{
            resume = await Resume.create({
                userId,
                extractedText:resumeText,
                ...resumeData
            })
        }

        await redis.set(`resume:${userId}`,JSON.stringify(resume),"EX",RESUME_CACHE_TTL_SECONDS);

        removeUpload(file);

        return res.status(200).json({
            success:true,
            message:"Resume analyzed successfully",
            data:resume,
            interviewCoin: charge.interviewCoin,
        })

    } catch (error) {
        console.log(error)

        removeUpload(req.file);

        if (error instanceof CoinServiceError) {
            return sendCoinError(res, error);
        }

        const interviewCoin = charge ? await refundCoins(userId, charge.reference) : undefined;

        return res.status(error.status || 500).json({
            success:false,
            message:error.message,
            interviewCoin,
        })
    }
}


export const getResume = async (req,res) => {
    try {
        const userId = req.headers["x-user-id"];

    const cache = await redis.get(`resume:${userId}`)

    if(cache){
        return res.status(200).json({
            success:true,
            source:"redis",
            data:JSON.parse(cache)
        })
    }
    const resume = await Resume.findOne({userId})

    if(!resume){
        return res.status(404).json({
            success:false,
            message:"resume not found"
        })
    }

    await redis.set(`resume:${userId}`,JSON.stringify(resume),"EX",RESUME_CACHE_TTL_SECONDS);


     return res.status(200).json({
            success:true,
            source:"mongoDb",
            data:resume
        })

    } catch (error) {
        console.log(error)
         return res.status(500).json({
            success:false,
            message:error.message,
        })
    }



}

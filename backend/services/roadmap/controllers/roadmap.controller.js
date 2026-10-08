import mongoose from "mongoose";
import redis from "../../../shared/redis/redis.js";
import { chargeCoins, refundCoins, sendCoinError, CoinServiceError } from "../../../shared/coins/coins.js";
import graph from "../graph/roadmap.graph.js";
import Roadmap from "../models/roadmap.model.js";

const CACHE_TTL_SECONDS = 60 * 60;
const MAX_FIELD_LENGTH = 100;

// Cache keys include the userId, so a cached roadmap can only ever be served
// to the user who owns it.
const roadmapKey = (userId, id) => `roadmap:${userId}:${id}`;
const listKey = (userId) => `userRoadmaps:${userId}`;

export const generateRoadmap =async (req,res)=> {
    let charge = null;
    const userId = req.headers["x-user-id"]

    try {
        const {
      useResume = false,
      resume,} = req.body;

      const role = String(req.body.role || "").trim()
      const targetPackage = String(req.body.targetPackage || "").trim()

      // Validate BEFORE charging, so bad input never costs coins.
      if(!role || !targetPackage){
        return res.status(400).json({
        success: false,
        message: "Role and Target Package are required.",
      });}

      if(role.length > MAX_FIELD_LENGTH || targetPackage.length > MAX_FIELD_LENGTH){
        return res.status(400).json({
        success: false,
        message: `Role and Target Package must be at most ${MAX_FIELD_LENGTH} characters.`,
      });}

      if(useResume && !resume){
         return res.status(400).json({
        success: false,
        message: "Resume data is required. Analyse a resume first, or turn off the resume option.",
      });
      }

      // The service that runs the LLM charges for it (server-side price).
      charge = await chargeCoins(userId, "roadmap")

      const result = await graph.invoke({
        role,
      targetPackage,
      useResume,
      resume,
      })

      const roadmap = await Roadmap.create({
        userId,
        ...result.roadmap
      })

      await redis.set(roadmapKey(userId, roadmap._id),JSON.stringify(roadmap),"EX", CACHE_TTL_SECONDS)

      await redis.del(listKey(userId))

      return res.status(201).json({
      success: true,
      message: "Roadmap generated successfully.",
      data: roadmap,
      interviewCoin: charge.interviewCoin,
    });


    } catch (error) {
        console.log(error);

        if (error instanceof CoinServiceError) {
          return sendCoinError(res, error);
        }

        // Generation or saving failed after the charge: give the coins back.
        const interviewCoin = charge ? await refundCoins(userId, charge.reference) : undefined;

    return res.status(500).json({
      success: false,
      message: error.message,
      interviewCoin,
    });
    }
}


export const getAllRoadmap = async (req,res) => {
    try {
        const userId = req.headers["x-user-id"]
        const cache = await redis.get(listKey(userId))

        if(cache){
            return res.status(200).json({
        success: true,
        data: JSON.parse(cache),
      })
        }

        const roadmaps = await Roadmap.find({userId}).sort({createdAt: -1})

        await redis.set(listKey(userId),JSON.stringify(roadmaps),"EX",CACHE_TTL_SECONDS)

    return res.json({
      success: true,
      data: roadmaps,
    });
    } catch (error) {
       console.log(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
    }
}

export const getRoadmapbyId = async (req,res) => {
    try {
        const {id} = req.params;
        const userId = req.headers["x-user-id"];

        if(!mongoose.isValidObjectId(id)){
            return res.status(404).json({
                success: false,
                message: "Roadmap not found"
            });
        }

        const cache = await redis.get(roadmapKey(userId, id))
        if(cache){
            return res.json({
                success: true,
                fromCache: true,
                data: JSON.parse(cache)
            });

        }

        const roadmap = await Roadmap.findOne({
             _id: id,
            userId:userId
        })

        if(!roadmap){
            return res.status(404).json({
                success: false,
                message: "Roadmap not found"
            });
        }

        await redis.set(roadmapKey(userId, id),JSON.stringify(roadmap),"EX", CACHE_TTL_SECONDS)

        return res.json({
            success: true,
            fromCache: false,
            data: roadmap
        });
    } catch (error) {
      console.log(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
    }

}

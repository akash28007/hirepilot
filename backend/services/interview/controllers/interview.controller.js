import mongoose from "mongoose";
import redis from "../../../shared/redis/redis.js";
import { chargeCoins, refundCoins, sendCoinError, CoinServiceError } from "../../../shared/coins/coins.js";
import graph from "../graph/graph.js";
import Interview from "../models/interview.model.js";


const INTERVIEW_TYPES = ["hr", "technical"]
const MAX_ROLE_LENGTH = 100
const MAX_ANSWER_LENGTH = 15000

export const startInterview = async (req, res) => {
    let charge = null
    const userId = req.headers["x-user-id"]

    try {
        const {
            useResume = false,
            resume = {}, } = req.body;

        const type = String(req.body.type || "").toLowerCase().trim()
        const role = String(req.body.role || "").trim()

        // Validate BEFORE charging, so bad input never costs coins.
        if (!type || !role) {
            return res.status(400).json({
                success: false,
                message: "Interview type and role are required",
            });
        }

        if (!INTERVIEW_TYPES.includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Interview type must be 'hr' or 'technical'",
            });
        }

        if (role.length > MAX_ROLE_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Role must be at most ${MAX_ROLE_LENGTH} characters`,
            });
        }

        // The service that runs the LLM charges for it (server-side price).
        charge = await chargeCoins(userId, "start-interview")

        const result = await graph.invoke({
            action: "start",
            role,
            type,
            useResume,
            resume
        })

        const questions = result.questions;

        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error("Failed to generate interview questions")
        }

        const interview = await Interview.create({
            userId,

            type,

            role,

            useResume,

            questions,

            currentQuestion: 0,

            status: "in-progress",
        })

        await redis.del(`interviews:${userId}`)

        return res.status(200).json({
            success: true,

            interviewId: interview._id,

            currentQuestion: 0,

            totalQuestions: interview.questions.length,

            question: interview.questions[0],

            interviewCoin: charge.interviewCoin,
        })
    } catch (error) {

        console.log(error)

        if (error instanceof CoinServiceError) {
            return sendCoinError(res, error)
        }

        // Generation or saving failed after the charge: give the coins back.
        const interviewCoin = charge ? await refundCoins(userId, charge.reference) : undefined

        return res.status(500).json({

            success: false,

            message: error.message,

            interviewCoin,

        });
    }
}


export const submitAnswer = async (req, res) => {
    try {
        const userId = req.headers["x-user-id"]
        const { interviewId, answer } = req.body

        if (!interviewId || typeof answer !== "string" || !answer.trim()) {
            return res.status(400).json({
                success: false,
                message: "Interview Id and Answer are required",
            });
        }

        if (!mongoose.isValidObjectId(interviewId)) {
            return res.status(404).json({
                success: false,
                message: "Interview not found",
            });
        }

        if (answer.length > MAX_ANSWER_LENGTH) {
            return res.status(413).json({
                success: false,
                message: `Answer must be at most ${MAX_ANSWER_LENGTH} characters`,
            });
        }

        const interview = await Interview.findOne({
            _id: interviewId,
            userId
        })

        if (!interview) {
            return res.status(404).json({
                success: false,
                message: "Interview not found",
            });
        }

        if (interview.status === "completed") {
            return res.status(400).json({
                success: false,
                message: "Interview already completed",
            });
        }

        const index = interview.currentQuestion
        const currentQuestion = interview.questions[index]

        if (!currentQuestion) {
            return res.status(400).json({
                success: false,
                message: "Invalid question index",
            });
        }

        currentQuestion.userAnswer = answer;

        const completed = interview.currentQuestion + 1 >=
            interview.questions.length;

        const result = await graph.invoke({
            action: "feedback",

            question: currentQuestion.question,

            answer,

            difficulty: currentQuestion.difficulty,

            completed,

            role: interview.role,

            type: interview.type,

            questions: interview.questions,
        })


        currentQuestion.feedback = result.feedback;

        interview.currentQuestion++;


        if (completed) {

            interview.status = "completed";

            interview.overallScore =
                result.report.overallScore;

            interview.summary =
                result.report.summary;

            interview.strengths =
                result.report.strengths;

            interview.weaknesses =
                result.report.weaknesses;

            interview.recommendations =
                result.report.recommendations;

            await interview.save()

            await redis.del(`interviews:${userId}`)

            return res.status(200).json({

                success: true,

                completed: true,

                interview,

                feedback: result.feedback,

            });

        }


        await interview.save()

        await redis.del(`interviews:${userId}`)

        return res.status(200).json({

            success: true,

            completed: false,

            currentQuestion: interview.currentQuestion,

            question:
                interview.questions[
                interview.currentQuestion
                ],

            feedback: result.feedback,

        });

    } catch (error) {

        // Two submits for the same question raced; the first one won.
        if (error instanceof mongoose.Error.VersionError) {
            return res.status(409).json({
                success: false,
                message: "This answer was already submitted",
            });
        }

        console.log(error);

        return res.status(500).json({

            success: false,

            message: error.message,

        });

    }
}


export const getInterview = async (req, res) => {
    try {
        const userId = req.headers["x-user-id"]
        const { id } = req.params

        if (!mongoose.isValidObjectId(id)) {
            return res.status(404).json({
                success: false,
                message: "Interview not found",
            });
        }

        const interview = await Interview.findOne({
            _id: id,
            userId
        })
        if (!interview) {
            return res.status(404).json({
                success: false,
                message: "Interview not found",
            });
        }

        return res.status(200).json({
            success: true,
            interview,
        });
    } catch (error) {
        console.log(error);

        return res.status(500).json({

            success: false,

            message: error.message,

        });
    }
}


export const getAllInterviews = async (req, res) => {
    try {
        const userId = req.headers["x-user-id"]

        const cache = await redis.get(`interviews:${userId}`)

        if (cache) {
            console.log("✅ Data served from Redis")
            return res.status(200).json(JSON.parse(cache))
        }

        const interviews = await Interview.find({ userId }).sort({ createdAt: -1 })

        const completed = interviews.filter((item) => item.status === "completed")

        // Questions the user actually answered (unanswered ones in unfinished
        // interviews are not counted).
        const totalQuestions = interviews.reduce(
            (sum, item) => sum + item.questions.filter((q) => q.userAnswer && q.userAnswer.trim()).length,
            0
        )

        const averageScore = completed.length > 0 ? Number(
            (completed.reduce((sum, item) => sum + item.overallScore, 0)) / completed.length).toFixed(1) : 0


        const stats = {
            totalInterviews: interviews.length,
            totalQuestions,
            completed: completed.length,
            averageScore
        }


        const getAverageData = (list) => {
            if (!list.length) {
                return [
                    { skill: "Correctness", score: 0 },
                    { skill: "Clarity", score: 0 },
                    { skill: "Relevance", score: 0 },
                    { skill: "Detail", score: 0 },
                    { skill: "Efficiency", score: 0 },
                    { skill: "Communication", score: 0 },
                    { skill: "Problem solving", score: 0 },
                    { skill: "Creativity", score: 0 },
                ];
            }

            const total = {
                correctness: 0,
                clarity: 0,
                relevance: 0,
                detail: 0,
                efficiency: 0,
                communication: 0,
                problemSolving: 0,
                creativity: 0,
            }

            list.forEach((interview) => {
                interview.questions.forEach((q) => {
                    total.correctness += q.feedback.correctness || 0;
                    total.clarity += q.feedback.clarity || 0;
                    total.relevance += q.feedback.relevance || 0;
                    total.detail += q.feedback.detail || 0;
                    total.efficiency += q.feedback.efficiency || 0;
                    total.communication += q.feedback.communication || 0;
                    total.problemSolving += q.feedback.problemSolving || 0;
                    total.creativity += q.feedback.creativity || 0;

                })
            })

            const count = list.reduce((sum, item) => sum + item.questions.length, 0)

            if (count === 0) {
                return [
                    { skill: "Correctness", score: 0 },
                    { skill: "Clarity", score: 0 },
                    { skill: "Relevance", score: 0 },
                    { skill: "Detail", score: 0 },
                    { skill: "Efficiency", score: 0 },
                    { skill: "Communication", score: 0 },
                    { skill: "Problem solving", score: 0 },
                    { skill: "Creativity", score: 0 },
                ];
            }


            return [
                {
                    skill: "Correctness",
                    score: Math.round(total.correctness / count)
                },
                {
                    skill: "Clarity",
                    score: Math.round(total.clarity / count),
                },

                {
                    skill: "Relevance",
                    score: Math.round(total.relevance / count),
                },

                {
                    skill: "Detail",
                    score: Math.round(total.detail / count),
                },

                {
                    skill: "Efficiency",
                    score: Math.round(total.efficiency / count),
                },

                {
                    skill: "Communication",
                    score: Math.round(total.communication / count),
                },

                {
                    skill: "Problem solving",
                    score: Math.round(total.problemSolving / count),
                },

                {
                    skill: "Creativity",
                    score: Math.round(total.creativity / count),
                },


            ]
        }

            const technicalInterviews = completed.filter((item) => item.type === "technical")

            const HrInterviews = completed.filter((item) => item.type === "hr")


            const technicalData = getAverageData(technicalInterviews)

            const hrData = getAverageData(HrInterviews)

            const technicalCount = technicalInterviews.length

            const hrCount = HrInterviews.length

            const payload = {
                success: true,
                interviews,
                stats,
                technicalData,
                hrData,
                technicalCount,
                hrCount,
            }

            await redis.set(`interviews:${userId}`, JSON.stringify(payload), "EX", 600)


            return res.status(200).json(payload);

        


    } catch (error) {
        console.log(error)
        return res.status(500).json({

            success: false,

            message: error.message,

        });
    }
}



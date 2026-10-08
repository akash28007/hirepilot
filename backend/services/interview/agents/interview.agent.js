import llm from "../config/llm.js"
import hrInterviewPrompt from "../prompts/hrInterviewPrompt.js"
import technicalInterviewPrompt from "../prompts/technicalInterviewPrompt.js"



export const interviewAgent = async (data) => {

    let response;

    try {
        const prompt = data.type?.toLowerCase() === "hr" ? hrInterviewPrompt(data) : technicalInterviewPrompt(data)

        response = await llm.invoke(prompt)

        const cleaned = response.content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

        return JSON.parse(cleaned)
    } catch (error) {
        console.log("Interview Agent Parse Error");
    console.log(response?.content ?? error.message);

    throw new Error("Failed to generate interview questions.");
        
    }
}
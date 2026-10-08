import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import llm from "../config/llm.js"

export const resumeAgent = async (resumeText) => {
    const response = await llm.invoke([
        new SystemMessage(`
You are an Expert ATS Resume Analyzer.

Analyze the given resume.

Extract the following information:

- Full Name
- Email
- Phone Number
- Professional Summary
- Technical Skills
- Projects
- Education
- Experience
- Strengths
- Weaknesses
- Missing Skills
- Suggested Job Role
- ATS Score (0-100)
- Recommendations

IMPORTANT RULES:

1. Return ONLY valid JSON.
2. Do not use markdown.
3. Do not explain anything.
4. Do not add extra text.
5. Every field must exist.

Response Format:

{
  "name":"",
  "email":"",
  "phone":"",
  "summary":"",
  "skills":[],
  "projects":[],
  "education":[],
  "experience":[],
  "strengths":[],
  "weaknesses":[],
  "missingSkills":[],
  "suggestedRole":"",
  "score":0,
  "recommendations":[]
}
`),
   new HumanMessage(resumeText),
    ])

    // Models sometimes wrap JSON in ```json fences despite the instructions.
    const cleaned = String(response.content)
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()

    try {
        return JSON.parse(cleaned)
    } catch {
        console.log("Resume Agent Parse Error")
        console.log(cleaned)
        throw new Error("The AI returned an unreadable analysis. Please try again.")
    }
}
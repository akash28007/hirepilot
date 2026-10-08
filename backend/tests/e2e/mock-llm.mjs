// OpenAI-compatible stand-in for Groq. Picks a canned reply from the prompt.
import http from "http"
import fs from "fs"
const log = (o) => fs.appendFileSync(new URL("./mock-llm.log", import.meta.url), JSON.stringify(o) + "\n")
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const reply = (content) => ({ id: "x", object: "chat.completion", created: 0, model: "mock",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })

http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c
  if (!body) { res.writeHead(200); return res.end("ok") }
  const msgs = JSON.parse(body).messages || []
  const text = msgs.map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n")
  let out
  if (text.includes("Expert ATS Resume Analyzer")) {
    out = "```json\n" + JSON.stringify({ name: "Test User", email: "t@example.com", phone: "1", summary: "Backend dev",
      skills: ["Node.js", "MongoDB"], projects: [{ name: "HirePilot", techStack: "Node" }], education: [{ degree: "B.Tech" }],
      experience: [], strengths: ["APIs"], weaknesses: ["Testing"], missingSkills: ["Kubernetes"], suggestedRole: "Backend Developer",
      score: 82, recommendations: ["Add metrics"], userId: "000000000000000000000000", _id: "000000000000000000000000" }) + "\n```"
  } else if (text.includes("Senior HR Interviewer") || text.includes("Senior Technical Interviewer")) {
    log({ kind: "questions", objectObject: text.includes("[object Object]"), hasProject: text.includes("HirePilot – Node") })
    if (text.includes("FAILME")) out = "sorry, not json"
    else out = "```json\n" + JSON.stringify(["easy","easy","medium","hard","medium","hard"].map((d, i) => ({ question: `Q${i+1}?`, difficulty: d, timer: 90 }))) + "\n```"
  } else if (text.includes("Evaluate the candidate exactly like a real interviewer")) {
    await sleep(400)
    out = JSON.stringify({ score: 77, correctness: 70, clarity: 80, relevance: 75, detail: 70, efficiency: 70, communication: 80, problemSolving: 75, creativity: 60, feedback: "Good.", improvements: ["a", "b", "c"] })
  } else if (text.includes("Generate a final interview report")) {
    const start = text.indexOf("Interview Questions and Feedback")
    const json = text.slice(text.indexOf("[", start), text.indexOf("\n", text.indexOf("[", start)))
    let last = null; try { const qs = JSON.parse(json); last = qs[qs.length - 1] } catch (e) { last = { parseError: e.message } }
    log({ kind: "summary", lastFeedbackScore: last?.feedback?.score, lastAnswer: last?.userAnswer })
    out = JSON.stringify({ overallScore: last?.feedback?.score ?? -1, summary: "s", strengths: ["x"], weaknesses: ["y"], recommendations: ["z"] })
  } else if (text.includes("Learning Roadmap Generator")) {
    out = JSON.stringify({ title: "Backend Roadmap", targetPackage: "20 LPA", duration: "6 months", level: "intermediate",
      modules: Array.from({ length: 8 }, (_, i) => ({ title: `Module ${i+1}`, duration: "2 weeks", difficulty: i < 3 ? "easy" : "MEDIUM", description: "d" })) })
  } else if (text.includes("return the official documentation")) {
    out = JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ title: `Module ${i+1}`, article: `https://example.com/${i+1}` })))
  } else {
    out = "unhandled prompt"; log({ kind: "unhandled", head: text.slice(0, 120) })
  }
  res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(reply(out)))
}).listen(9999, "127.0.0.1", () => console.log("mock llm on 9999"))

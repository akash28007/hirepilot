// End-to-end checks for the coin, auth and interview fixes.
// Start the stack first with ./start-stack.sh (see README.md in this folder).
import { createRequire } from "module"
import crypto from "crypto"
import fs from "fs"
import { fileURLToPath } from "url"
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const mongoose = createRequire(here("../../services/auth/package.json"))("mongoose")
const Redis = createRequire(here("../../package.json"))("ioredis")
const MONGO = process.env.MONGO_URL_BASE || "mongodb://127.0.0.1:27017"

const G = "http://127.0.0.1:8000"
const redis = new Redis("redis://127.0.0.1:6380")
const users = mongoose.createConnection(`${MONGO}/e2e-users`)
const billingDb = mongoose.createConnection(`${MONGO}/e2e-billing`)
const interviewDb = mongoose.createConnection(`${MONGO}/e2e-interview`)
const resumeDb = mongoose.createConnection(`${MONGO}/e2e-resume`)
await Promise.all([users.asPromise(), billingDb.asPromise(), interviewDb.asPromise(), resumeDb.asPromise()])

let pass = 0, fail = 0
const check = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`) }

const mkUser = async (name, coins) => {
  const _id = new mongoose.Types.ObjectId()
  await users.collection("users").insertOne({ _id, firebaseUid: "fb-" + name + Date.now(), name, email: `${name}${Date.now()}@x.com`, interviewCoin: coins, createdAt: new Date(), updatedAt: new Date() })
  const sid = crypto.randomUUID()
  await redis.set(`session:${sid}`, JSON.stringify({ userId: _id, name, email: "x" }), "EX", 3600)
  return { id: String(_id), cookie: `session=${sid}`, sid }
}
const call = async (u, method, path, body, extraHeaders = {}) => {
  const headers = { ...(u ? { cookie: u.cookie } : {}), ...extraHeaders }
  let payload
  if (body instanceof FormData) payload = body
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body) }
  const r = await fetch(G + path, { method, headers, body: payload })
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data }
}
const coins = async (u) => (await call(u, "GET", "/api/me")).data?.user?.interviewCoin
const upload = (u) => { const fd = new FormData(); fd.append("resume", new Blob([fs.readFileSync(here("./fixtures/resume.pdf"))], { type: "application/pdf" }), "resume.pdf"); return call(u, "POST", "/api/resume/upload", fd) }

const A = await mkUser("alice", 150)
const B = await mkUser("bob", 150)

console.log("\n— Sessions and /api/me")
let r = await call(A, "GET", "/api/me")
check("/api/me returns fresh balance from MongoDB", r.status === 200 && r.data.user.interviewCoin === 150, JSON.stringify(r.data))
check("/api/me without cookie is 401", (await call(null, "GET", "/api/me")).status === 401)

console.log("\n— Coin endpoints can no longer be abused")
r = await call(A, "POST", "/api/auth/add-coins", { coins: 100000 })
check("public add-coins route is gone", r.status === 404, `status ${r.status}`)
r = await call(A, "POST", "/api/auth/use-coins", { action: "download-pdf", coins: -1000 })
check("use-coins ignores client amount (negative) and charges server price 10", r.status === 200 && r.data.interviewCoin === 140, JSON.stringify(r.data))
r = await call(A, "POST", "/api/auth/use-coins", { action: "start-interview", coins: 1 })
check("use-coins refuses actions that services charge themselves", r.status === 400)
r = await call(A, "POST", "/api/auth/internal/credit", { userId: A.id, coins: 5000, reference: "hack1" }, { "x-internal-key": "test-internal-key-0123456789abcdef" })
check("gateway blocks /api/auth/internal/* even with the key", r.status === 404, `status ${r.status}`)
check("balance unchanged after abuse attempts", await coins(A) === 140)

console.log("\n— Services only accept the gateway")
let d = await fetch("http://127.0.0.1:8003/all", { headers: { "x-user-id": A.id } })
check("direct call to interview service with forged x-user-id is 401", d.status === 401, `status ${d.status}`)
d = await fetch("http://127.0.0.1:8001/internal/credit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: A.id, coins: 5000, reference: "hack2" }) })
check("direct call to auth internal credit without key is 401", d.status === 401)
r = await call(A, "GET", "/api/interview/all", undefined, { "x-user-id": B.id })
check("browser-sent x-user-id is overwritten by gateway", r.status === 200 && (r.data.interviews || []).every(i => i.userId === A.id))

console.log("\n— Resume analysis (charged by resume service)")
r = await upload(A)
check("upload succeeds and returns new balance (140-10=130)", r.status === 200 && r.data.interviewCoin === 130, JSON.stringify({ s: r.status, c: r.data?.interviewCoin, m: r.data?.message }))
check("LLM-supplied userId/_id are ignored", r.data?.data?.userId === A.id && r.data?.data?._id !== "000000000000000000000000")
check("fenced JSON from the model is parsed", r.data?.data?.score === 82)
const files = fs.readdirSync(here("../../services/resume/uploads"))
check("uploaded PDF deleted after analysis", files.length === 0, files.join(","))
const tooPoor = await mkUser("carol", 5)
r = await upload(tooPoor)
check("upload with 5 coins is refused with 402", r.status === 402 && r.data.required === 10, JSON.stringify(r.data))
check("…and nothing was stored for that user", (await resumeDb.collection("resumes").countDocuments({ userId: new mongoose.Types.ObjectId(tooPoor.id) })) === 0)

console.log("\n— Interview: validation, charging, refunds")
const before = await coins(A)
r = await call(A, "POST", "/api/interview/start", { type: "technical" })
check("missing role is rejected (was && bug)", r.status === 400)
r = await call(A, "POST", "/api/interview/start", { type: "panel", role: "Dev" })
check("invalid type rejected", r.status === 400)
check("no coins taken for rejected input", await coins(A) === before)
r = await call(A, "POST", "/api/interview/start", { type: "technical", role: "FAILME dev" })
check("LLM failure returns 500 with refunded balance", r.status === 500 && r.data.interviewCoin === before, JSON.stringify(r.data))
check("balance fully restored after failed start", await coins(A) === before)

const resume = (await call(A, "GET", "/api/resume/get-resume")).data.data
r = await call(A, "POST", "/api/interview/start", { type: "hr", role: "Backend Developer", useResume: true, resume })
check("start succeeds, charges 50", r.status === 200 && r.data.interviewCoin === before - 50, JSON.stringify({ s: r.status, c: r.data?.interviewCoin }))
const iv = r.data.interviewId
const qlog = fs.readFileSync(here("./mock-llm.log"), "utf8").trim().split("\n").map(JSON.parse).filter(x => x.kind === "questions").pop()
check("resume projects reach the prompt as text, not [object Object]", qlog && !qlog.objectObject && qlog.hasProject, JSON.stringify(qlog))

r = await call(A, "POST", "/api/interview/answer", { interviewId: iv })
check("answer missing is rejected (was && bug)", r.status === 400)
r = await call(A, "POST", "/api/interview/answer", { interviewId: "not-an-id", answer: "x" })
check("invalid interview id is 404, not 500", r.status === 404)
r = await call(B, "POST", "/api/interview/answer", { interviewId: iv, answer: "x" })
check("another user cannot answer this interview", r.status === 404)

const [r1, r2] = await Promise.all([
  call(A, "POST", "/api/interview/answer", { interviewId: iv, answer: "answer one" }),
  call(A, "POST", "/api/interview/answer", { interviewId: iv, answer: "answer one (double click)" }),
])
const st = [r1.status, r2.status].sort()
check("double submit: one succeeds, the other gets 409", st[0] === 200 && st[1] === 409, st.join(","))
let doc = await interviewDb.collection("interviews").findOne({ _id: new mongoose.Types.ObjectId(iv) })
check("…and the pointer advanced exactly once", doc.currentQuestion === 1, `currentQuestion=${doc.currentQuestion}`)

for (let i = 2; i <= 6; i++) r = await call(A, "POST", "/api/interview/answer", { interviewId: iv, answer: `answer ${i}` })
check("6th answer completes the interview", r.status === 200 && r.data.completed === true)
const slog = fs.readFileSync(here("./mock-llm.log"), "utf8").trim().split("\n").map(JSON.parse).filter(x => x.kind === "summary").pop()
check("summary agent now sees the LAST answer's feedback (score 77, was 0)", slog?.lastFeedbackScore === 77 && slog?.lastAnswer === "answer 6", JSON.stringify(slog))
check("overallScore stored from that summary", r.data.interview?.overallScore === 77)

r = await call(A, "GET", "/api/interview/all")
check("dashboard counts only answered questions (6)", r.status === 200 && r.data.stats.totalQuestions === 6, JSON.stringify(r.data.stats))

console.log("\n— Concurrency: three starts with coins for one")
const D = await mkUser("dave", 60)
const rs = await Promise.all([1, 2, 3].map(() => call(D, "POST", "/api/interview/start", { type: "hr", role: "Dev" })))
const ok = rs.filter(x => x.status === 200).length, poor = rs.filter(x => x.status === 402).length
check("only one of three concurrent starts is charged", ok === 1 && poor === 2, rs.map(x => x.status).join(","))
check("balance never goes negative (60-50=10)", await coins(D) === 10)

console.log("\n— Roadmap")
const beforeR = await coins(A)
r = await call(A, "POST", "/api/roadmap/generate", { role: "Backend", targetPackage: "20 LPA", useResume: true })
check("useResume without resume is rejected before charging", r.status === 400 && await coins(A) === beforeR)
r = await call(A, "POST", "/api/roadmap/generate", { role: "Backend", targetPackage: "20 LPA" })
check("roadmap generated, charged 20", r.status === 201 && r.data.interviewCoin === beforeR - 20, JSON.stringify({ s: r.status, m: r.data?.message }))
check("level/difficulty normalised to enums", r.data?.data?.level === "Intermediate" && r.data?.data?.modules?.[3]?.difficulty === "Medium")
const rid = r.data.data._id
check("A can read own roadmap (cached)", (await call(A, "GET", `/api/roadmap/${rid}`)).data?.fromCache === true)
r = await call(B, "GET", `/api/roadmap/${rid}`)
check("B cannot read A's cached roadmap", r.status === 404, `status ${r.status}`)

console.log("\n— Billing: verify credits server-side, once")
const orderId = "order_test_" + Date.now(), payId = "pay_test_1"
await billingDb.collection("billings").insertOne({ userId: new mongoose.Types.ObjectId(A.id), amount: 199, interviewCoins: 300, razorpayOrderId: orderId, status: "created", coinsCredited: false, createdAt: new Date(), updatedAt: new Date() })
const sig = crypto.createHmac("sha256", "rzp_secret").update(`${orderId}|${payId}`).digest("hex")
const beforeB = await coins(A)
r = await call(B, "POST", "/api/billing/verify", { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: sig })
check("another user cannot verify A's order", r.status === 404)
r = await call(A, "POST", "/api/billing/verify", { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: "bad" + sig.slice(3) })
check("bad signature rejected, no coins", r.status === 400 && await coins(A) === beforeB)
r = await call(A, "POST", "/api/billing/verify", { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: sig })
check("valid payment credits 300 server-side", r.status === 200 && r.data.interviewCoin === beforeB + 300, JSON.stringify(r.data))
const again = await Promise.all([1, 2].map(() => call(A, "POST", "/api/billing/verify", { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: sig })))
check("replaying verify (twice, concurrently) never credits again", again.every(x => x.status === 200) && await coins(A) === beforeB + 300, again.map(x => x.data?.message).join(" | "))
const bdoc = await billingDb.collection("billings").findOne({ razorpayOrderId: orderId })
check("order marked paid and credited", bdoc.status === "paid" && bdoc.coinsCredited === true)

console.log("\n— Logout")
await call(A, "GET", "/api/auth/logout")
check("session is gone after logout", (await call(A, "GET", "/api/me")).status === 401)

console.log(`\n${pass} passed, ${fail} failed`)
await Promise.all([users.close(), billingDb.close(), interviewDb.close(), resumeDb.close()]); redis.disconnect()
process.exit(fail ? 1 : 0)

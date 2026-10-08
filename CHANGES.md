# Changes: security and correctness fixes

This round fixes the coin and payment flow (it was enforced only in the
browser), closes header spoofing between the gateway and the services, fixes
several bugs in the interview flow, and brings the docs in line with the code.
An end-to-end test suite covers all of it (`backend/tests/e2e`, 45 checks).

## Before you run it: two new environment variables

| Variable | Where | Value |
|---|---|---|
| `INTERNAL_API_KEY` | gateway **and** all five services | the same long random string everywhere |
| `AUTH_SERVICE_URL` | resume, interview, roadmap, billing (gateway already has it) | `http://localhost:8001` |

Generate a key with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Every `.env.example` has been updated. If the key is missing or differs,
services answer `401` (or `503` if unset).

## 1. Coins and payments are enforced on the server

**Before:** the browser called `/api/auth/use-coins` with an amount it chose,
then called the feature; after paying it called `/api/auth/add-coins` with the
number of coins to add. Anyone logged in could add unlimited coins, a negative
"debit" added coins, and the AI endpoints could be called without paying at all.

**Now:**

- **Prices live on the server** (`services/auth/configs/pricing.js`). The browser never sends an amount.
- **The service that does the work charges for it.** Resume, interview and roadmap call the auth service's internal `/internal/charge` before the LLM call and `/internal/refund` if anything fails afterwards. Input is validated *before* charging, so bad requests cost nothing.
- **Atomic balance updates.** A charge is one MongoDB update, "decrement by price where balance ≥ price", so concurrent requests can't overspend or go negative.
- **Coin ledger.** New `CoinTransaction` collection in the auth DB records every debit, refund and credit with a unique `reference`. Replaying a credit or refund is a no-op.
- **Billing credits coins itself** after verifying the Razorpay HMAC signature, for an order that must belong to the caller, using the order ID as the ledger reference. Verify is idempotent (safe to retry; never double-credits). New `coinsCredited` flag on `Billing`.
- **`/api/auth/add-coins` is removed.** `/api/auth/use-coins` now only accepts `{ action: "download-pdf" }`, the one action that happens entirely in the browser.
- **Fixed** the `/verify` error path, which referenced an undefined `Payment` model.
- **Session no longer caches the coin balance.** `/api/me` is now served by the auth service from MongoDB, so the balance is never stale.

API changes the frontend now relies on:
- Resume upload, interview start and roadmap generate return `interviewCoin` (the new balance) and answer **`402`** with `{ interviewCoin, required }` when the balance is too low. On a failure after charging, the response carries the refunded balance.
- `/api/billing/verify` returns `interviewCoin`.

## 2. Services only accept requests from the gateway

**Before:** services trusted `x-user-id` from anyone, so calling a service port directly allowed acting as any user.

**Now:**
- The gateway always overwrites `x-user-id` and adds `x-internal-key`. New `shared/middleware/requireGateway.js` rejects requests without the key in every service (health-check `/` routes stay open).
- The gateway returns `404` for `/api/auth/internal/*` and strips internal headers from all `/api/auth/*` requests.
- Internal auth routes require the key and compare it in constant time.

## 3. Bug fixes

| Area | Fix |
|---|---|
| Interview summary | The summary agent now receives the **last answer's feedback**. Before, question 6 reached it with every score at 0, which could drag the overall score down. |
| Double submit | `optimisticConcurrency` on `Interview`: two concurrent submits for the same question now give one `200` and one `409` instead of grading twice. The UI reloads on 409. |
| Input validation | `/start` and `/answer` used `&&` instead of `||`, so a request missing only one field got through. Also validates interview type, role length, answer length and ObjectIds (bad IDs now 404 instead of 500). |
| Agent errors | The interview agents' `catch` blocks logged `response`, which was out of scope there; the resulting ReferenceError hid the real parse error. |
| Prompts | Resume projects/experience stored as objects appeared as `[object Object]` in interview prompts. New `prompts/format.js` flattens them; experience is now included. |
| Uploads | Saved under a random name instead of the original filename, so concurrent `resume.pdf` uploads can't overwrite each other. Multer errors (wrong type, too large) return 400/413. Scanned PDFs with no text return 422 (refunded). |
| Resume LLM output | Only the 14 expected fields are stored (an LLM-returned `userId`/`_id` is ignored), the score is clamped to 0–100, and code fences are stripped before parsing. The resume cache now expires after 24 h. |
| Roadmap cache | Cache keys include the user ID, so a cached roadmap can't be read by another user. `useResume` without a resume is rejected before charging. |
| Dashboard | "Questions Solved" counts answered questions only. |
| Frontend | Resume analysis loads right after login (not only after a reload) and is cleared on logout. Interview start/answer failures show the real reason instead of crashing on `null`. |
| Housekeeping | Billing Dockerfile `EXPOSE 8005` (was 8004). Auth and roadmap now have the `/` health route the docs describe. Removed the unused gateway controller. `useCoins` renamed to `spendCoins` (it isn't a React hook; this cleared lint errors). |

## 4. Docs and UI copy now match the code

- README: coin flow, gateway/internal-key model, cache behaviour, "eight dimensions plus overall", roadmap level picked by the AI, env table (adds `INTERNAL_API_KEY`, `AUTH_SERVICE_URL`, `YOUTUBE_API_KEY`, `VITE_RAZORPAY_KEY_ID`), API table, Node 20.12+.
- SETUP.md / SECURITY.md: Redis on 6380, Node 20.12+, new variables, removed links to the missing `PROJECT_AUDIT.md`, new "Coin and Payment Integrity" section.
- Billing page: removed "Unlimited Resume Score / Unlimited Roadmaps / Priority AI Response" (not implemented); price list says "PDF Download" instead of "Resume Builder".
- Landing page agent descriptions describe what each feature actually does.

## How it was tested

- `backend/tests/e2e`: real gateway + all five services over HTTP, **45/45 passing**. Covers abuse attempts on coin endpoints, header spoofing, charge/refund on success and failure, three concurrent starts with coins for one, double submit, the summary fix, cross-user roadmap access, and payment verification (wrong user, bad signature, valid, replayed twice concurrently).
- Frontend: `vite build` passes; ESLint reports no new findings (9 old ones gone). A headless-browser smoke test confirmed the dashboard balance, roadmap generation, starting an interview and the Billing page against the running backend.
- **Limits:** Groq was replaced by a local mock LLM, and Firebase login, Razorpay Checkout and YouTube were not called live. The database was FerretDB (MongoDB-compatible) because MongoDB itself couldn't be downloaded in the test environment. Run the suite once against your real MongoDB/Atlas setup (see `backend/tests/e2e/README.md`) and do one manual login and Razorpay test-mode payment.

## Still open (fine to discuss as trade-offs)

- The PDF download charge can't be enforced, because the PDF is printed in the browser.
- No mid-request crash recovery: if a service dies between charging and refunding, the coins stay charged (the ledger shows it). A Razorpay webhook would also cover a browser closed before `/verify`.
- LLM output is still parsed from text; schema-validated structured output would be the next step.
- The timer is enforced only in the browser; there's no rate limiting; LLM-written article links aren't checked.

# End-to-end tests

Runs the real gateway and all five services against a local database and a
mock LLM, then checks the security and correctness fixes over HTTP:

- coins cannot be added or spent from the browser (no `add-coins`, server-side prices, negative amounts ignored)
- services reject requests that bypass the gateway; `x-user-id` cannot be forged
- each AI service charges before the LLM call and refunds on failure
- concurrent requests cannot overspend (atomic balance update)
- double-submitting an interview answer is rejected with 409
- the final interview summary sees the last answer's feedback
- users cannot read each other's cached roadmaps
- payment verification credits coins once, only for the order's owner

External services are replaced: Groq with `mock-llm.mjs`, Firebase with a
throwaway key (login itself is not exercised; sessions are seeded in Redis),
Razorpay and YouTube with dummy keys.

## Run

```bash
# 1. MongoDB on 27017 and Redis on 6380
docker run -d --name hirepilot-mongo-test -p 27017:27017 mongo:7
cd backend && docker compose up -d && cd ..

# 2. npm install in backend/, backend/gateway and every service (see the main README)

# 3. Start the stack, run the tests, stop the stack
./backend/tests/e2e/start-stack.sh
node backend/tests/e2e/e2e.test.mjs
./backend/tests/e2e/stop-stack.sh
```

The suite uses databases named `e2e-*`, never your development data.

#!/bin/bash
# Starts the gateway, the five services and a mock LLM for the e2e suite.
# Needs: MongoDB (or a compatible server) on 27017 and Redis on 6380 already
# running, and `npm install` done in backend/, gateway/ and every service.
# External services are replaced: Groq -> local mock, Firebase -> throwaway
# key (login is not exercised), Razorpay/YouTube -> dummy keys (not called).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$HERE/../.." && pwd)"
L="$HERE/logs"; mkdir -p "$L"
MONGO="${MONGO_URL_BASE:-mongodb://127.0.0.1:27017}"

if [ ! -f "$HERE/.sa.json" ]; then
  openssl genrsa -out "$HERE/.key.pem" 2048 2>/dev/null
  node -e "const fs=require('fs');fs.writeFileSync(process.argv[2],JSON.stringify({type:'service_account',project_id:'e2e',private_key_id:'e2e',private_key:fs.readFileSync(process.argv[1],'utf8'),client_email:'e2e@e2e.iam.gserviceaccount.com',client_id:'1',token_uri:'https://oauth2.googleapis.com/token'}))" "$HERE/.key.pem" "$HERE/.sa.json"
fi

export REDIS_URL=redis://127.0.0.1:6380 INTERNAL_API_KEY=test-internal-key-0123456789abcdef AUTH_SERVICE_URL=http://127.0.0.1:8001
export GROQ_API_KEY=test GROQ_BASE_URL=http://127.0.0.1:9999 YOUTUBE_API_KEY=test RAZORPAY_KEY_ID=rzp_test RAZORPAY_KEY_SECRET=rzp_secret
export FIREBASE_SERVICE_ACCOUNT_KEY="$(cat "$HERE/.sa.json")"

rm -f "$HERE/mock-llm.log"
: > "$L/pids"
node "$HERE/mock-llm.mjs" > "$L/mock.log" 2>&1 & echo $! >> "$L/pids"
for s in auth:8001:users resume:8002:resume interview:8003:interview roadmap:8004:roadmap billing:8005:billing; do
  IFS=: read name port db <<< "$s"
  (cd "$R/services/$name" && PORT=$port MONGODB_URL=$MONGO/e2e-$db exec node index.js > "$L/$name.log" 2>&1) & echo $! >> "$L/pids"
done
(cd "$R/gateway" && PORT=8000 FRONTEND_URL=http://localhost:5173 RESUME_SERVICE_URL=http://127.0.0.1:8002 INTERVIEW_SERVICE_URL=http://127.0.0.1:8003 ROADMAP_SERVICE_URL=http://127.0.0.1:8004 BILLING_SERVICE_URL=http://127.0.0.1:8005 exec node index.js > "$L/gateway.log" 2>&1) & echo $! >> "$L/pids"
sleep 5
echo "Stack started (logs in $L). Run: node $HERE/e2e.test.mjs   Stop: $HERE/stop-stack.sh"

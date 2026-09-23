# 🚀 HirePilot - Quick Setup Guide

This guide will get you up and running with HirePilot locally in under 10 minutes.

## ✅ Prerequisites

- **Node.js** v18+
- **MongoDB** (local or Atlas)
- **Redis** (via Docker: `docker run -d -p 6379:6379 redis`)
- **API Keys** (Firebase, Razorpay, Groq, YouTube)
- **Git**

---

## 📦 Phase 1: Clone & Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd 2.hirepilot

# Backend dependencies
cd backend
npm install

cd gateway
npm install
cd ../services/auth && npm install
cd ../services/resume && npm install
cd ../services/interview && npm install
cd ../services/roadmap && npm install
cd ../services/billing && npm install

# Frontend dependencies
cd ../../frontend
npm install
```

---

## 🔐 Phase 2: Setup Environment Variables

### 1. Backend Gateway

Create `backend/gateway/.env`:
```env
PORT=8000
REDIS_URL="redis://localhost:6379"
AUTH_SERVICE_URL="http://localhost:8001"
RESUME_SERVICE_URL="http://localhost:8002"
INTERVIEW_SERVICE_URL="http://localhost:8003"
ROADMAP_SERVICE_URL="http://localhost:8004"
BILLING_SERVICE_URL="http://localhost:8005"
FRONTEND_URL="http://localhost:5173"
```

### 2. Auth Service

Create `backend/services/auth/.env`:
```env
PORT=8001
MONGODB_URL="mongodb://localhost:27017/hirepilot-users"
REDIS_URL="redis://localhost:6379"
# Option: Use FIREBASE_SERVICE_ACCOUNT_KEY env var or keep serviceAccountKey.json locally
```

### 3. Resume Service

Create `backend/services/resume/.env`:
```env
PORT=8002
MONGODB_URL="mongodb://localhost:27017/hirepilot-resume"
REDIS_URL="redis://localhost:6379"
GROQ_API_KEY="your-groq-api-key-from-console.groq.com"
```

### 4. Interview Service

Create `backend/services/interview/.env`:
```env
PORT=8003
MONGODB_URL="mongodb://localhost:27017/hirepilot-interview"
REDIS_URL="redis://localhost:6379"
GROQ_API_KEY="your-groq-api-key-from-console.groq.com"
```

### 5. Roadmap Service

Create `backend/services/roadmap/.env`:
```env
PORT=8004
MONGODB_URL="mongodb://localhost:27017/hirepilot-roadmap"
REDIS_URL="redis://localhost:6379"
GROQ_API_KEY="your-groq-api-key-from-console.groq.com"
YOUTUBE_API_KEY="your-youtube-api-key-from-console.cloud.google.com"
```

### 6. Billing Service

Create `backend/services/billing/.env`:
```env
PORT=8005
MONGODB_URL="mongodb://localhost:27017/hirepilot-billing"
RAZORPAY_KEY_ID="your-razorpay-key-id"
RAZORPAY_KEY_SECRET="your-razorpay-key-secret"
```

### 7. Frontend

Create `frontend/.env`:
```env
VITE_FIREBASE_APIKEY="your-firebase-api-key"
VITE_RAZORPAY_KEY_ID="your-razorpay-key-id"
VITE_BACKEND_URL="http://localhost:8000"
```

---

## 🔑 Getting API Keys

### Firebase
1. Go to [Firebase Console](https://console.firebase.google.com/project/<your-firebase-project-id>/settings/general)
2. Copy API Key from Project Settings
3. For backend, download Service Account JSON (keep locally, don't commit)

### Razorpay
1. [Razorpay Dashboard](https://dashboard.razorpay.com/) → Account & Billing → API Keys
2. Copy Key ID and Key Secret

### Groq
1. [Groq Console](https://console.groq.com/keys)
2. Create and copy API Key

### YouTube API
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Enable YouTube Data API v3
3. Create API Key credential

---

## 📊 Phase 3: Setup Databases

### MongoDB
```bash
# Local MongoDB (Docker)
docker run -d -p 27017:27017 --name mongodb mongo

# Or MongoDB Atlas (cloud)
# Get connection string from https://www.mongodb.com/cloud/atlas
# Format: mongodb+srv://username:password@cluster.mongodb.net/database
```

### Redis
```bash
# Docker (already done above)
docker run -d -p 6379:6379 redis

# Test connection
redis-cli ping
# Should output: PONG
```

---

## 🎮 Phase 4: Start Services

### Terminal 1: Redis
```bash
# If using Docker
docker start redis  # or just keep it running

# Check Redis is ready
redis-cli ping
```

### Terminal 2: MongoDB
```bash
# If using Docker
docker start mongodb

# Check with MongoDB client
mongosh "mongodb://localhost:27017"
```

### Terminal 3: Backend Services
```bash
cd backend/gateway
npm run dev  # Starts on port 8000
```

### Terminal 4: Auth Service
```bash
cd backend/services/auth
npm run dev  # Starts on port 8001
```

### Terminal 5: Resume Service
```bash
cd backend/services/resume
npm run dev  # Starts on port 8002
```

### Terminal 6: Interview Service
```bash
cd backend/services/interview
npm run dev  # Starts on port 8003
```

### Terminal 7: Roadmap Service
```bash
cd backend/services/roadmap
npm run dev  # Starts on port 8004
```

### Terminal 8: Billing Service
```bash
cd backend/services/billing
npm run dev  # Starts on port 8005
```

### Terminal 9: Frontend
```bash
cd frontend
npm run dev  # Starts on port 5173
```

---

## ✅ Verify Setup

Once all services are running:

```bash
# Test Gateway
curl http://localhost:8000/
# Output: "Hello from Gateway"

# Test Auth Service
curl http://localhost:8001/
# Output: "Hello from Auth Service"

# Open Frontend
open http://localhost:5173/
# Should show the HirePilot login page
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` for MongoDB | Make sure MongoDB is running: `docker ps` |
| `ECONNREFUSED` for Redis | Make sure Redis is running: `docker ps` |
| `GROQ_API_KEY not found` | Ensure `.env` file in service directory with correct key |
| Port already in use | Change PORT in `.env` or kill process: `lsof -i :8000` |
| CORS errors | Ensure `FRONTEND_URL` in gateway `.env` is correct |

---

## 📚 Important Files

- **Security Setup:** See [`SECURITY.md`](./SECURITY.md)
- **Full Audit:** See [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md)
- **Environment Templates:** `.env.example` in each directory

---

## 🔄 Next: Phase 2 & Beyond

After basic setup works, continue with:

1. **Phase 2:** Database setup, Redis persistence, comprehensive error handling
2. **Phase 3:** Input validation, logging system, rate limiting
3. **Phase 4:** API documentation, unit tests
4. **Phase 5:** Deployment (Docker Compose, CI/CD, production)

See [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md#13-recommended-configuration--modification-order) for full roadmap.

---

## 💡 Tips

- Use `npm run dev` for development (auto-reload with nodemon)
- Use `npm start` for production
- Frontend runs on `http://localhost:5173` (Vite dev server)
- All backend APIs go through gateway on `http://localhost:8000`
- Check service health: `curl http://localhost:PORT/`

---

## 🆘 Need Help?

1. Check logs in each terminal window
2. Review [`SECURITY.md`](./SECURITY.md) for configuration details
3. Review [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md) for architecture details
4. Verify all `.env` files are set correctly
5. Ensure all databases are running

---

**✨ Happy coding! Welcome to HirePilot development.**

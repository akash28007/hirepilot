# Security Configuration & Setup Guide

## Phase 1: Security Hardening - COMPLETED ✅

This document covers the security improvements implemented in Phase 1 and provides setup instructions for proper configuration.

---

## 🔐 What Was Fixed

### 1. Environment Variable Management
**Status:** ✅ Implemented

All sensitive configuration moved to environment variables with `.env.example` templates provided.

**What Changed:**
- Created `.env.example` files in:
  - `backend/gateway/`
  - `backend/services/auth/`
  - `backend/services/resume/`
  - `backend/services/interview/`
  - `backend/services/roadmap/`
  - `backend/services/billing/`
  - `frontend/`

- Updated `.gitignore` files to exclude:
  - `.env` files (all variants)
  - `serviceAccountKey.json` and similar sensitive files
  - Logs, build artifacts, node_modules, IDE files

**Why It Matters:**
- Prevents accidental commit of secrets
- Provides clear documentation of required variables
- Enables different configurations per environment

### 2. Firebase Service Account Protection
**Status:** ✅ Partially Implemented (Migration Support)

Firebase authentication now supports environment-based configuration.

**What Changed:**
- `backend/services/auth/configs/firebase.js` updated to:
  1. First, try to load Firebase credentials from `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable (JSON string)
  2. If not set, fall back to loading from `serviceAccountKey.json` file with warning
  3. Clear error messages if neither is available

**How to Use:**

#### Option A: Production Setup (Recommended)
```bash
# Convert serviceAccountKey.json to single-line JSON string
# On macOS/Linux:
cat serviceAccountKey.json | jq -c '.' | tr '\n' ' '

# Or use Node.js:
node -e "console.log(JSON.stringify(require('./serviceAccountKey.json')))"

# Set the environment variable in your deployment:
export FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"<your-firebase-project-id>",...}'

# Or in Docker/Kubernetes, set via secrets management
```

#### Option B: Development Setup (During Migration)
```bash
# Keep serviceAccountKey.json locally (in .gitignore)
# The app will warn about using file-based config
# Upgrade to Option A when ready for production
```

### 3. .gitignore Updates
**Status:** ✅ Implemented

Comprehensive `.gitignore` files added to prevent accidental commits of sensitive data.

**Protected Files/Patterns:**
```
.env*                           # Environment files
serviceAccountKey.json          # Firebase credentials
logs/                          # Application logs
node_modules/                  # Dependencies
dist/, build/                  # Build outputs
.vscode/, .idea/              # IDE files
*.log, *.db, *.sqlite         # Runtime files
```

---

## 📋 Environment Variables by Service

### Gateway Service (`backend/gateway/.env`)
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

### Auth Service (`backend/services/auth/.env`)
```env
PORT=8001
MONGODB_URL="mongodb://localhost:27017/hirepilot-users"
REDIS_URL="redis://localhost:6379"
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

### Resume Service (`backend/services/resume/.env`)
```env
PORT=8002
MONGODB_URL="mongodb://localhost:27017/hirepilot-resume"
REDIS_URL="redis://localhost:6379"
GROQ_API_KEY="your-groq-api-key"
```

### Interview Service (`backend/services/interview/.env`)
```env
PORT=8003
MONGODB_URL="mongodb://localhost:27017/hirepilot-interview"
REDIS_URL="redis://localhost:6379"
GROQ_API_KEY="your-groq-api-key"
```

### Roadmap Service (`backend/services/roadmap/.env`)
```env
PORT=8004
MONGODB_URL="mongodb://localhost:27017/hirepilot-roadmap"
REDIS_URL="redis://localhost:6379"
GROQ_API_KEY="your-groq-api-key"
YOUTUBE_API_KEY="your-youtube-api-key"
```

### Billing Service (`backend/services/billing/.env`)
```env
PORT=8005
MONGODB_URL="mongodb://localhost:27017/hirepilot-billing"
RAZORPAY_KEY_ID="your-razorpay-key-id"
RAZORPAY_KEY_SECRET="your-razorpay-key-secret"
```

### Frontend (`frontend/.env`)
```env
VITE_FIREBASE_APIKEY="your-firebase-api-key"
VITE_RAZORPAY_KEY_ID="your-razorpay-key-id"
VITE_BACKEND_URL="http://localhost:8000"
```

---

## 🚨 CRITICAL: Removing Secrets from Git History

If `serviceAccountKey.json` has already been committed, it must be removed from git history:

### Step 1: Install git-filter-repo
```bash
pip install git-filter-repo
# or
brew install git-filter-repo  # macOS
```

### Step 2: Remove File from History
```bash
cd /path/to/your/repo
git filter-repo --invert-paths --path backend/services/auth/serviceAccountKey.json
```

### Step 3: Force Push (⚠️ Only if not shared)
```bash
git push --force-with-lease origin main
```

### Step 4: Regenerate Firebase Credentials
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your Firebase project
3. Go to Project Settings → Service Accounts
4. Click "Delete" on the compromised key
5. Click "Generate New Private Key"
6. Save the new JSON file locally (add to .gitignore)

---

## 🔑 Obtaining Required API Keys

### 1. Firebase Configuration
Configured via your Firebase project, but you need:
- **Frontend:** API Key from Firebase Console → Project Settings → General
- **Backend:** Service Account Key (new one after rotation)

**Location:** [Firebase Console](https://console.firebase.google.com/project/<your-firebase-project-id>/settings/general)

### 2. Razorpay API Keys
**Get from:** [Razorpay Dashboard](https://dashboard.razorpay.com/) → Account & Billing → API Keys

- `RAZORPAY_KEY_ID`: Public key (safe to expose)
- `RAZORPAY_KEY_SECRET`: Private key (keep secret)

**Note:** Frontend and backend must use the same Key ID

### 3. Groq API Key
**Get from:** [Groq Console](https://console.groq.com/keys)

Used by: Resume, Interview, Roadmap services

### 4. YouTube API Key
**Get from:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

Steps:
1. Create/select project
2. Enable YouTube Data API v3
3. Create API Key credential

Used by: Roadmap service

### 5. MongoDB Connection Strings
Set up MongoDB instances (Atlas, local, or Docker):

```
MONGODB_URL="mongodb://username:password@host:port/database?authSource=admin"
```

Or locally:
```
MONGODB_URL="mongodb://localhost:27017/hirepilot-{service}"
```

---

## 🐳 Docker Setup with Secrets

For containerized deployment, use Docker secrets or environment files:

```dockerfile
# Example Dockerfile with secret handling
FROM node:20

WORKDIR /app

# Don't COPY .env files directly
# Instead, use --build-arg or runtime environment variables
ARG MONGODB_URL
ARG REDIS_URL
ARG GROQ_API_KEY

ENV MONGODB_URL=$MONGODB_URL
ENV REDIS_URL=$REDIS_URL
ENV GROQ_API_KEY=$GROQ_API_KEY

# Rest of Dockerfile...
```

Build command:
```bash
docker build \
  --build-arg MONGODB_URL="..." \
  --build-arg REDIS_URL="..." \
  --build-arg GROQ_API_KEY="..." \
  -t hirepilot-service:latest .
```

Or with Docker Compose secrets:
```yaml
version: '3.9'
services:
  auth:
    image: hirepilot-auth:latest
    environment:
      MONGODB_URL: ${MONGODB_URL}
      REDIS_URL: ${REDIS_URL}
      FIREBASE_SERVICE_ACCOUNT_KEY: ${FIREBASE_SERVICE_ACCOUNT_KEY}
    secrets:
      - firebase_key
secrets:
  firebase_key:
    file: ./secrets/firebase-key.json
```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] `.env` files created locally (NOT in git)
- [ ] `.env.example` files present in repository (for documentation)
- [ ] `.gitignore` updated and committed
- [ ] `serviceAccountKey.json` removed from git history (if applicable)
- [ ] All required environment variables set:
  - [ ] `MONGODB_URL` (all services)
  - [ ] `REDIS_URL` (gateway + services)
  - [ ] `GROQ_API_KEY` (resume, interview, roadmap)
  - [ ] `YOUTUBE_API_KEY` (roadmap)
  - [ ] `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (billing)
  - [ ] `FIREBASE_SERVICE_ACCOUNT_KEY` (auth)
  - [ ] `VITE_FIREBASE_APIKEY` (frontend)
  - [ ] `VITE_RAZORPAY_KEY_ID` (frontend)

## 🧪 Testing Configuration

```bash
# Test environment variable loading
cd backend/services/auth
node -e "import('./configs/firebase.js').then(() => console.log('✅ Firebase config loaded'))"

# Test gateway routing
curl http://localhost:8000/ 
# Should show: "Hello from Gateway"

# Test service connectivity
curl http://localhost:8001/
# Should show: "Hello from Auth"
```

---

## 🔐 Security Best Practices

1. **Never commit `.env` files** - Always use `.env.example`
2. **Rotate credentials regularly** - Especially Firebase and Razorpay keys
3. **Use strong, unique API keys** - Don't reuse keys across environments
4. **Audit git history** - Regularly check for accidental secrets commits
5. **Use secret managers** - AWS Secrets Manager, HashiCorp Vault, or similar for production
6. **Enable 2FA** - On Firebase, Razorpay, and Google Cloud accounts
7. **Monitor API usage** - Set up alerts for unusual activity
8. **Limit key permissions** - Use IAM roles with minimal required permissions

---

## 📚 Next Steps

Phase 2 focuses on:
- Database setup and backups
- Redis configuration with persistence
- Comprehensive error handling
- Input validation on all endpoints

See `PROJECT_AUDIT.md` for the full improvement roadmap.

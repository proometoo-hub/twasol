# Twasol Pro v6.48.3

تطبيق تواصل ومحادثة متكامل — صوت، فيديو، رسائل، مجموعات، قصص، والمزيد.

## Quick Start (Local)

```bash
# 1. PostgreSQL
docker run -d --name twasol-pg -p 5432:5432 -e POSTGRES_PASSWORD=twasol -e POSTGRES_DB=twasol postgres:16

# 2. Generate JWT secret and put in backend/.env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Backend
cd backend && npm install && npx prisma db push && npm run dev

# 4. Frontend (new terminal)
cd frontend && npm install && npm start
```

Open http://localhost:3020

## Global Deployment (Railway + Vercel)

See **DEPLOY_GLOBAL_GUIDE_AR.txt** for full guide, or run:

```bash
bash deploy-setup.sh
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Socket.IO Client, Axios |
| Backend | Express, TypeScript, Socket.IO, Prisma |
| Database | PostgreSQL |
| Desktop | Electron |
| Mobile | React Native (Expo) |
| Calls | WebRTC (STUN/TURN) |

## Features

- 💬 Real-time messaging (text, images, files, voice)
- 📞 Voice & video calls (1:1 and group) via WebRTC
- 👥 Groups & channels with admin controls
- 📸 Stories (24h expiry)
- 📊 Polls, scheduled messages, quick replies
- 🔒 2FA, session management, ghost mode
- 🌐 Multi-language (Arabic, English, +more)
- 🤖 AI translation & transcription (optional)
- 💰 Wallet system & commerce
- 📱 Mobile app (Expo/React Native)
- 🖥️ Desktop app (Electron)

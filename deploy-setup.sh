#!/bin/bash
# ============================================================
# Twasol Pro — Global Deployment Setup Script
# Run: bash deploy-setup.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║     Twasol Pro v6.48.3 — Global Deployment      ║"
echo "║           Railway + Vercel Setup                 ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"
command -v node >/dev/null 2>&1 || { echo -e "${RED}Node.js is required. Install from https://nodejs.org${NC}"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}npm is required.${NC}"; exit 1; }
command -v git >/dev/null 2>&1 || { echo -e "${RED}git is required.${NC}"; exit 1; }

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}Node.js 18+ is required. Current: $(node -v)${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v), npm $(npm -v), git $(git --version | cut -d' ' -f3)${NC}"

# Generate JWT_SECRET
echo -e "\n${YELLOW}[2/6] Generating secure JWT_SECRET...${NC}"
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
echo -e "${GREEN}✓ Generated JWT_SECRET: ${JWT_SECRET:0:12}...${NC}"

# Railway URL
echo -e "\n${YELLOW}[3/6] Enter your deployment URLs${NC}"
read -p "Railway backend URL (e.g. https://twasol-production.up.railway.app): " RAILWAY_URL
RAILWAY_URL=${RAILWAY_URL%/}  # Remove trailing slash

read -p "Vercel frontend URL (e.g. https://twasol.vercel.app): " VERCEL_URL
VERCEL_URL=${VERCEL_URL%/}

read -p "Your admin email: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}

# Write backend .env
echo -e "\n${YELLOW}[4/6] Writing backend/.env for production...${NC}"
cat > backend/.env << ENVEOF
DATABASE_URL="\${DATABASE_URL}"
JWT_SECRET="${JWT_SECRET}"
PORT=\${PORT:-4000}
BIND_HOST="0.0.0.0"
PUBLIC_APP_URL="${RAILWAY_URL}"
ALLOWED_ORIGINS="${VERCEL_URL},${RAILWAY_URL},https://*.vercel.app"
ADMIN_EMAILS="${ADMIN_EMAIL}"
ALLOW_FIRST_USER_ADMIN="true"
ALLOW_PUBLIC_UPLOADS="false"
HTTPS_ENABLED="false"
SERVE_FRONTEND_BUILD="false"
TRUST_PROXY_HOPS="1"
NODE_ENV="production"
OPENAI_API_KEY=""
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL_TRANSLATE="gpt-4.1-mini"
OPENAI_MODEL_TRANSCRIBE="gpt-4o-mini-transcribe"
ENVEOF
echo -e "${GREEN}✓ backend/.env written${NC}"

# Write frontend .env.production
echo -e "\n${YELLOW}[5/6] Writing frontend/.env.production for Vercel...${NC}"
cat > frontend/.env.production << ENVEOF
REACT_APP_API_URL=${RAILWAY_URL}
REACT_APP_SOCKET_URL=${RAILWAY_URL}
REACT_APP_STUN_URL=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302
REACT_APP_TURN_URL=turn:openrelay.metered.ca:443,turn:openrelay.metered.ca:443?transport=tcp
REACT_APP_TURN_USERNAME=openrelayproject
REACT_APP_TURN_CREDENTIAL=openrelayproject
ENVEOF
echo -e "${GREEN}✓ frontend/.env.production written${NC}"

# Summary
echo -e "\n${YELLOW}[6/6] Summary — Railway Environment Variables${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Set these in Railway dashboard → Variables tab:"
echo ""
echo -e "  ${GREEN}DATABASE_URL${NC}       → Railway adds this automatically with PostgreSQL plugin"
echo -e "  ${GREEN}JWT_SECRET${NC}         → ${JWT_SECRET}"
echo -e "  ${GREEN}PORT${NC}               → 4000"
echo -e "  ${GREEN}PUBLIC_APP_URL${NC}     → ${RAILWAY_URL}"
echo -e "  ${GREEN}ALLOWED_ORIGINS${NC}    → ${VERCEL_URL},${RAILWAY_URL},https://*.vercel.app"
echo -e "  ${GREEN}ADMIN_EMAILS${NC}       → ${ADMIN_EMAIL}"
echo -e "  ${GREEN}ALLOW_FIRST_USER_ADMIN${NC} → true"
echo -e "  ${GREEN}TRUST_PROXY_HOPS${NC}   → 1"
echo -e "  ${GREEN}NODE_ENV${NC}           → production"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Set these in Vercel dashboard → Settings → Environment Variables:"
echo ""
echo -e "  ${GREEN}REACT_APP_API_URL${NC}        → ${RAILWAY_URL}"
echo -e "  ${GREEN}REACT_APP_SOCKET_URL${NC}     → ${RAILWAY_URL}"
echo -e "  ${GREEN}REACT_APP_TURN_URL${NC}       → turn:openrelay.metered.ca:443"
echo -e "  ${GREEN}REACT_APP_TURN_USERNAME${NC}  → openrelayproject"
echo -e "  ${GREEN}REACT_APP_TURN_CREDENTIAL${NC}→ openrelayproject"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✓ Setup complete!                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Push to GitHub:  git init && git add . && git commit -m 'init' && git push"
echo "  2. Railway: New Project → Deploy from GitHub → select repo → set Root Directory to / "
echo "  3. Railway: Add PostgreSQL plugin → copy DATABASE_URL"
echo "  4. Railway: Set environment variables (shown above)"
echo "  5. Vercel: Import project → set Root Directory to 'frontend' → set env vars"
echo "  6. Test: Open Vercel URL → Register → Start chatting!"

@echo off
cd /d "%~dp0"
title Twasol Pro Full Suite HTTPS v6.46.1
echo Starting Twasol Pro Full Suite (HTTPS LAN)...
start "Twasol-Backend-HTTPS" cmd /k "cd /d %~dp0backend && set HTTPS_ENABLED=true&& set PUBLIC_APP_URL=https://11.0.0.103:3020&& set ALLOWED_ORIGINS=http://localhost:3020,http://127.0.0.1:3020,http://11.0.0.103:3020,https://localhost:3020,https://127.0.0.1:3020,https://11.0.0.103:3020&& set SSL_KEY_FILE=../certs/https/11.0.0.103/server.key.pem&& set SSL_CERT_FILE=../certs/https/11.0.0.103/server.cert.pem&& npm run dev"
start "Twasol-Frontend-HTTPS" cmd /k "cd /d %~dp0frontend && set HOST=11.0.0.103&& set HTTPS=true&& set WDS_SOCKET_HOST=11.0.0.103&& set SSL_CRT_FILE=%~dp0certs\https\11.0.0.103\server.cert.pem&& set SSL_KEY_FILE=%~dp0certs\https\11.0.0.103\server.key.pem&& npm start"
timeout /t 12 /nobreak >nul
start "Twasol-Desktop" cmd /k "cd /d %~dp0 && set FRONTEND_HOST=11.0.0.103&& set FRONTEND_SCHEME=https&& npm run electron"
start "Twasol-Mobile" cmd /k "cd /d %~dp0mobile-app && set EXPO_PUBLIC_API_URL=https://11.0.0.103:4000&& set EXPO_PUBLIC_MOBILE_WEB_URL=https://11.0.0.103:3020&& npm run start:lan"
echo ========================================
echo Web: https://11.0.0.103:3020
echo API: https://11.0.0.103:4000
echo Health: https://11.0.0.103:4000/api/health
echo Install certs\client-trust\rootCA.cer on all client devices first.
echo ========================================
pause

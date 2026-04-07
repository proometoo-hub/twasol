@echo off
cd /d "%~dp0"
title Twasol Pro Mobile LAN v6.47.0

echo Building frontend for secure same-origin mobile web...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 goto :error
cd /d "%~dp0"

start "Twasol-Backend-HTTPS" cmd /k "cd /d %~dp0backend && set HTTPS_ENABLED=true&& set SERVE_FRONTEND_BUILD=true&& set PUBLIC_APP_URL=https://11.0.0.103:4000&& set ALLOWED_ORIGINS=https://11.0.0.103:4000,https://localhost:4000,https://127.0.0.1:4000,http://11.0.0.103:3020,http://localhost:3020,http://127.0.0.1:3020,https://11.0.0.103:3020,https://localhost:3020,https://127.0.0.1:3020&& set SSL_KEY_FILE=../certs/https/11.0.0.103/server.key.pem&& set SSL_CERT_FILE=../certs/https/11.0.0.103/server.cert.pem&& npm run dev"
timeout /t 4 /nobreak >nul
start "Twasol-Mobile" cmd /k "cd /d %~dp0mobile-app && set EXPO_PUBLIC_API_URL=https://11.0.0.103:4000&& set EXPO_PUBLIC_MOBILE_WEB_URL=https://11.0.0.103:4000&& npm run start:lan"

echo ========================================
echo Mobile App API: https://11.0.0.103:4000
echo Mobile Web URL: https://11.0.0.103:4000
echo ========================================
pause
exit /b 0

:error
echo Frontend build failed
pause
exit /b 1

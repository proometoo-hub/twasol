@echo off
cd /d "%~dp0"
title Twasol Pro Radical HTTPS v6.47.0

echo ========================================
echo Building frontend for unified secure origin...
echo ========================================
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 goto :error
cd /d "%~dp0"

echo ========================================
echo Starting unified HTTPS server on 11.0.0.103:4000
echo ========================================
start "Twasol-Radical-HTTPS" cmd /k "cd /d %~dp0backend && set HTTPS_ENABLED=true&& set SERVE_FRONTEND_BUILD=true&& set PUBLIC_APP_URL=https://11.0.0.103:4000&& set ALLOWED_ORIGINS=https://11.0.0.103:4000,https://localhost:4000,https://127.0.0.1:4000,http://11.0.0.103:3020,http://localhost:3020,http://127.0.0.1:3020,https://11.0.0.103:3020,https://localhost:3020,https://127.0.0.1:3020&& set SSL_KEY_FILE=../certs/https/11.0.0.103/server.key.pem&& set SSL_CERT_FILE=../certs/https/11.0.0.103/server.cert.pem&& npm run dev"

echo ========================================
echo Web + API + Socket: https://11.0.0.103:4000
echo Important: افتح الجوال من هذا العنوان فقط

echo وثبت على كل جهاز: certs\client-trust\rootCA.cer

echo ========================================
pause
exit /b 0

:error
echo Frontend build failed
pause
exit /b 1

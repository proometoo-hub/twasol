@echo off
cd /d "%~dp0"
title Twasol Pro Desktop v6.47.0

echo Building frontend for desktop bundle target...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 goto :error
cd /d "%~dp0"

start "Twasol-Backend-HTTPS" cmd /k "cd /d %~dp0backend && set HTTPS_ENABLED=true&& set SERVE_FRONTEND_BUILD=true&& set PUBLIC_APP_URL=https://11.0.0.103:4000&& set ALLOWED_ORIGINS=https://11.0.0.103:4000,https://localhost:4000,https://127.0.0.1:4000&& set SSL_KEY_FILE=../certs/https/11.0.0.103/server.key.pem&& set SSL_CERT_FILE=../certs/https/11.0.0.103/server.cert.pem&& npm run dev"
timeout /t 5 /nobreak >nul
start "Twasol-Desktop" cmd /k "cd /d %~dp0 && set FRONTEND_HOST=11.0.0.103&& set FRONTEND_PORT=4000&& set FRONTEND_SCHEME=https&& npm run electron"

echo Desktop target: https://11.0.0.103:4000
pause
exit /b 0

:error
echo Frontend build failed
pause
exit /b 1

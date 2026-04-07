@echo off
cd /d "%~dp0"
title Twasol Pro Web v6.46.1
echo Starting Twasol Pro (Web HTTP LAN)...
start "Twasol-Backend" cmd /k "cd /d %~dp0backend && set PUBLIC_APP_URL=http://11.0.0.103:3020&& set ALLOWED_ORIGINS=http://localhost:3020,http://127.0.0.1:3020,http://11.0.0.103:3020,https://localhost:3020,https://127.0.0.1:3020,https://11.0.0.103:3020&& npm run dev"
timeout /t 4 /nobreak >nul
start "Twasol-Frontend" cmd /k "cd /d %~dp0frontend && set HOST=11.0.0.103&& npm start"
echo ========================================
echo Web: http://11.0.0.103:3020
echo API: http://11.0.0.103:4000
echo Health: http://11.0.0.103:4000/api/health
echo ========================================
pause

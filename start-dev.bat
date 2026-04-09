@echo off
start "Tawasol Server" cmd /k "cd /d %~dp0server && npm install && npm run dev"
start "Tawasol Client" cmd /k "cd /d %~dp0client && npm install && npm run dev"

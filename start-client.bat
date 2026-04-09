@echo off
cd /d %~dp0client
call npm install
call npm run dev

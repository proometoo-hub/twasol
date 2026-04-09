@echo off
cd /d %~dp0server
call npm install
call npm run dev

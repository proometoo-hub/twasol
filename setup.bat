@echo off
cd /d "%~dp0"
title Twasol Pro Setup v6.47.0
echo ========================================
echo    Twasol Pro - Setup v6.47.0
echo    Path: %~dp0
echo    LAN IP: 11.0.0.103
echo ========================================

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js غير مثبت
  pause
  exit /b 1
)

if not exist "%~dp0backend\.env" (
  if exist "%~dp0backend\.env.example" (
    copy /Y "%~dp0backend\.env.example" "%~dp0backend\.env" >nul
    echo [INFO] تم إنشاء backend\.env من .env.example
  )
)

echo [1/4] Installing root packages...
call npm install --ignore-scripts
if errorlevel 1 goto :error

echo [2/4] Installing backend...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 goto :error
call npx prisma generate
if errorlevel 1 goto :error
call npx prisma db push
if errorlevel 1 goto :error

echo [3/4] Installing frontend...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 goto :error

echo [4/4] Installing mobile app...
cd /d "%~dp0mobile-app"
call npm install
if errorlevel 1 goto :mobile_fix
call npx expo install --fix --npm
if errorlevel 1 goto :error
goto :done

:mobile_fix
echo [INFO] npm install للموبايل فشل، سيتم ضبط إصدارات Expo تلقائيا...
call npx expo install --fix --npm
if errorlevel 1 goto :error

:done

echo ========================================
echo Setup complete - النسخة 6.47.0 جاهزة للتشغيل
echo HTTP Dev Web:  http://11.0.0.103:3020
echo HTTPS Unified: https://11.0.0.103:4000
echo API:          https://11.0.0.103:4000
echo للتشغيل الجذري على الجوال والشبكة استخدم start-https.bat بعد تثبيت certs\client-trust\rootCA.cer.
echo ========================================
pause
exit /b 0

:error
echo Setup failed
echo راجع الرسالة الظاهرة بالأعلى ثم أعد المحاولة
pause
exit /b 1

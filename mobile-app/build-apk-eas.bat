@echo off
setlocal
cd /d %~dp0
echo ==============================
echo Building APK with EAS Cloud
echo ==============================
call npm install
if errorlevel 1 goto :fail
call npx eas-cli build -p android --profile apk
if errorlevel 1 goto :fail
goto :eof
:fail
echo.
echo EAS cloud build failed.
echo Ensure EAS login is completed and FCM/Expo notifications are configured for production builds.
exit /b 1

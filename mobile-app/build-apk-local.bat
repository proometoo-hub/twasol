@echo off
setlocal
cd /d %~dp0
echo ==============================
echo Building APK locally (release)
echo ==============================
call npm install
if errorlevel 1 goto :fail
call npx expo prebuild --platform android --clean
if errorlevel 1 goto :fail
cd android
call gradlew.bat clean
if errorlevel 1 goto :fail
call gradlew.bat assembleRelease
if errorlevel 1 goto :fail
echo.
echo APK path:
echo %cd%ppuild\outputspkeleasepp-release.apk
goto :eof
:fail
echo.
echo Local APK build failed. Ensure Java and Android SDK are installed.
exit /b 1

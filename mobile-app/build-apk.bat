@echo off
setlocal
cd /d %~dp0

echo ======================================
echo Building Android APK locally (optimized release)
echo ======================================
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
echo APK created at:
echo %cd%ppuild\outputspkeleasepp-release.apk
goto :eof

:fail
echo.
echo Build failed. Ensure Java + Android SDK are installed and ANDROID_HOME is configured.
exit /b 1

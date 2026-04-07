@echo off
echo Stopping Twasol Pro...
for %%P in (4000 3020 8081 19000 19001 19002) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /PID %%A /F >nul 2>nul
  )
)
taskkill /F /IM electron.exe >nul 2>nul
echo [OK] Stopped
pause

@echo off
setlocal
title Codeframe
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node 24+ from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Codeframe: editor on http://localhost:5173, sync server on ws://localhost:1234
echo Press Ctrl+C to stop.

rem Open the editor once Vite has had a few seconds to boot.
start "" /b cmd /c "timeout /t 4 /nobreak >nul && start "" http://localhost:5173"

call npm run dev
pause

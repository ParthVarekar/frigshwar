@echo off
setlocal
title Codeframe - shutdown

rem Stops whatever is listening on the Codeframe ports:
rem 5173 = web editor (Vite), 1234 = sync server (Hocuspocus)
set FOUND=0
for %%P in (5173 1234) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
    echo Stopping process %%I on port %%P...
    taskkill /PID %%I /T /F >nul 2>nul
    set FOUND=1
  )
)

if "%FOUND%"=="0" (
  echo Codeframe is not running.
) else (
  echo Codeframe stopped.
)
timeout /t 2 /nobreak >nul

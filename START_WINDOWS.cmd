@echo off
setlocal
cd /d "%~dp0Admin"
title Sibi Sports Club - Start Website

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed on this computer.
  echo Please install the LTS version from https://nodejs.org/ and run START_WINDOWS.cmd again.
  echo.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please reinstall Node.js LTS from https://nodejs.org/.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

if not exist ".env" (
  echo Admin\.env is missing.
  echo Copy .env.example to .env and set a unique admin email, password, and session secret.
  pause
  exit /b 1
)
set "APP_TIMEZONE=Asia/Kolkata"

echo.
echo ==========================================
echo       SIBI SPORTS CLUB WEBSITE
echo ==========================================
echo.
echo Preparing dependencies for this computer...
echo Using a Windows-compatible SQLite dependency to avoid requiring Visual Studio C++ build tools.
echo This may take a few minutes on the first run.
call npm install --omit=dev
if errorlevel 1 (
  echo.
  echo Dependency installation failed.
echo Check your internet connection. If npm still reports node-gyp or Visual Studio errors, install Node.js 20 LTS and try again.
echo Do not install Visual Studio just for this website unless the issue persists.
  pause
  exit /b 1
)

echo.
echo Starting the website at http://localhost:3000
echo Keep this window open while using the website.
echo Press Ctrl+C to stop the server.
start "Sibi Sports Club browser" /min cmd /c "timeout /t 3 /nobreak ^>nul ^& start "" http://localhost:3000"
node server.js
if errorlevel 1 (
  echo.
  echo The server stopped with an error. Please take a screenshot of this window.
  pause
)

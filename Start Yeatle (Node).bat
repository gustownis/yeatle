@echo off
title Yeatle
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org/en/download
  echo Then close this window and start Yeatle again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0]) < 18) process.exit(1)"
if errorlevel 1 (
  echo This Node.js version is too old. Install Node.js 24 LTS or newer.
  pause
  exit /b 1
)
node server.js
if errorlevel 1 echo Yeatle stopped with an error. Read the message above for the next step.
pause

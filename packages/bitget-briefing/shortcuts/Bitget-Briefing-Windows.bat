@echo off
rem ============================================================
rem  Bitget Daily Briefing — desktop shortcut (Windows)
rem  Double-click to fetch a fresh briefing and open it.
rem  Requires: Git (git-scm.com) and Node.js 18+ (nodejs.org)
rem ============================================================
setlocal EnableDelayedExpansion
title Bitget Daily Briefing

where git >nul 2>nul || (echo [!] Git is not installed. Get it from https://git-scm.com & pause & exit /b 1)
where node >nul 2>nul || (echo [!] Node.js is not installed. Get it from https://nodejs.org & pause & exit /b 1)

set "DIR=%LOCALAPPDATA%\bitget-briefing\Cryptonic"

if not exist "%DIR%\.git" (
  echo [*] First run: downloading the briefing bot...
  git clone --quiet https://github.com/far-reach/Cryptonic "%DIR%" || (echo [!] Clone failed & pause & exit /b 1)
)

cd /d "%DIR%"
git fetch --quiet origin

rem Follow the repo's default branch (where the bot now lives); fall back to the feature branch.
git remote set-head origin --auto >nul 2>nul
set "BR="
for /f "delims=" %%b in ('git rev-parse --abbrev-ref origin/HEAD 2^>nul') do set "BR=%%b"
set "BR=%BR:origin/=%"
if "%BR%"=="" set "BR=claude/bitget-briefing-bot-0z9sdw"
git ls-tree -r --name-only "origin/%BR%" 2>nul | findstr /b /c:"packages/bitget-briefing" >nul || set "BR=claude/bitget-briefing-bot-0z9sdw"

git checkout --quiet "%BR%"
git pull --quiet origin "%BR%"

cd packages\bitget-briefing
echo [*] Installing/updating dependencies (first run takes a minute)...
call npm install --silent --no-audit --no-fund

set "BRIEFING_OUTPUT=%TEMP%\bitget-briefing.md"
echo [*] Fetching today's Bitget announcements...
call npm run --silent briefing
if errorlevel 1 (echo [!] Briefing failed - see errors above. & pause & exit /b 1)

start "" notepad "%BRIEFING_OUTPUT%"
echo.
echo [OK] Briefing opened in Notepad (also shown above).
pause

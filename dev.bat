@echo off
setlocal
title Duokan - Development

cd /d "%~dp0"
if errorlevel 1 goto failed

where node.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js was not found.
    echo Install Node.js 22 LTS, then reopen this script.
    goto failed
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found. Reinstall Node.js with npm enabled.
    goto failed
)

if not exist "node_modules\.bin\next.cmd" (
    echo Installing dependencies. This may take a few minutes...
    call npm.cmd ci --cache ".cache\npm" --no-audit --no-fund
    if errorlevel 1 goto failed
)

set "UNI_LIVE_DIST_DIR=.next"
echo Starting Duokan in development mode...
echo Open http://localhost:3001 in your browser.
echo Pages compile on demand and update when source code changes.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
call npm.cmd run dev -- --port 3001
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo ERROR: Duokan could not start. Check the messages above.
pause
exit /b 1

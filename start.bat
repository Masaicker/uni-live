@echo off
setlocal
title Duokan

cd /d "%~dp0"
if errorlevel 1 goto failed

where node.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js was not found.
    echo Install the latest Node.js 22 LTS, then reopen this script.
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

set "UNI_LIVE_DIST_DIR=.cache/production"
if /i "%~1"=="--rebuild" goto build
node "scripts\production-build.cjs" check
if errorlevel 2 goto build
if errorlevel 1 goto failed
goto prepare

:build
echo Source changed or production build is missing. Rebuilding...
call "%~dp0build.bat" --no-pause
if errorlevel 1 goto failed

:prepare
robocopy "public" ".cache\production\standalone\public" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto failed
robocopy ".cache\production\static" ".cache\production\standalone\.cache\production\static" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto failed

if not defined PORT set "PORT=3000"
set "HOSTNAME=0.0.0.0"
echo Starting Duokan in production mode...
echo Open http://localhost:%PORT% in your browser.
echo Unchanged source reuses this build. Source changes rebuild automatically.
echo To build without starting, run build.bat. To force rebuild, use start.bat --rebuild.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
node ".cache\production\standalone\server.js"
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo ERROR: Duokan could not start. Check the messages above.
pause
exit /b 1

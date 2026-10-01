@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto failed

where node.exe >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js was not found. Install Node.js 22 LTS.
    goto failed
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found. Reinstall Node.js with npm enabled.
    goto failed
)
if not exist "node_modules\.bin\next.cmd" (
    call npm.cmd ci --cache ".cache\npm" --no-audit --no-fund
    if errorlevel 1 goto failed
)

set "UNI_LIVE_DIST_DIR=.cache/production"
node "scripts\production-build.cjs" prepare
if errorlevel 1 goto failed
echo Building Duokan for production...
call npm.cmd run build
if errorlevel 1 goto failed
robocopy "public" ".cache\production\standalone\public" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto failed
robocopy ".cache\production\static" ".cache\production\standalone\.cache\production\static" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto failed
node "scripts\production-build.cjs" stamp
if errorlevel 1 goto failed
echo Production build is ready. Run start.bat to launch.
exit /b 0

:failed
echo ERROR: Production build failed. See the messages above.
if /i not "%~1"=="--no-pause" pause
exit /b 1

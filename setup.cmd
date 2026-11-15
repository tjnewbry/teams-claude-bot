@echo off
rem One-time setup: downloads portable Node into runtime\, installs Playwright into node_modules\
rem and its Chromium into runtime\browsers. Safe to run again; finished steps are skipped.
setlocal
set "B=%~dp0"
set "NODE_VER=v22.23.4"
set "NODE_DIR=%B%runtime\node-%NODE_VER%-win-x64"
set "PLAYWRIGHT_BROWSERS_PATH=%B%runtime\browsers"
cd /d "%B%"

if not exist "%NODE_DIR%\node.exe" (
  echo Downloading Node %NODE_VER%...
  if not exist "%B%runtime" mkdir "%B%runtime"
  curl.exe -fL -o "%B%runtime\node.zip" "https://nodejs.org/dist/%NODE_VER%/node-%NODE_VER%-win-x64.zip" || goto :fail
  tar.exe -xf "%B%runtime\node.zip" -C "%B%runtime" || goto :fail
  del "%B%runtime\node.zip"
)
set "PATH=%NODE_DIR%;%PATH%"

if not exist "%B%node_modules\playwright" (
  echo Installing Playwright...
  call npm.cmd ci || goto :fail
)

echo Installing Chromium for Playwright...
call npx.cmd playwright install chromium || goto :fail

echo.
echo Setup done. Next: start.cmd, then sign in to Teams in the window that opens.
pause
exit /b 0

:fail
echo.
echo Setup failed (see the error above).
pause
exit /b 1

@echo off
rem Starts the Teams -> Claude bot. Usage: start.cmd [projectDir] [--model X] [--effort Y]
set "B=%~dp0"
if not exist "%B%runtime\node-v22.23.4-win-x64\node.exe" (
  echo The runtime folder is missing. Run setup.cmd first.
  pause
  exit /b 1
)
set "PLAYWRIGHT_BROWSERS_PATH=%B%runtime\browsers"
"%B%runtime\node-v22.23.4-win-x64\node.exe" "%B%src\index.js" %*
pause

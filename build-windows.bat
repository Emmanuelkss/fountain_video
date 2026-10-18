@echo off
rem Builds the FountainVideo Windows installer (release\FountainVideo-Setup-<version>.exe).
rem Requirements: Windows 10/11, Node.js 22 LTS or newer (https://nodejs.org), internet for the first build.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
echo === Installing build tools (first time only) ===
call npm install || goto :error
echo === Running tests ===
call npm test || goto :error
echo === Building installer ===
call npm run dist || goto :error
echo.
echo Done. The installer is in the "release" folder.
start "" explorer release
exit /b 0
:error
echo.
echo The build failed. Scroll up to see the error.
pause
exit /b 1

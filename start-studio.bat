@echo off
title MannSejro Studio Launcher
color 0E
cd /d "%~dp0"

echo ========================================================
echo             LAUNCHING MANNSEJRO STUDIO PRO
echo ========================================================
echo.

:: 1. Check if node_modules exists; if not, install dependencies automatically
if not exist "node_modules\" (
    echo [*] First-time setup detected. Installing packages...
    if exist "bun.lock" (
        call bun install
    ) else (
        call npm install
    )
)

:: 2. Launch the local Vite server in the background
echo [*] Starting local studio server...
if exist "bun.lock" (
    start /B bun dev --port=3000
) else (
    start /B npm run dev -- --port=3000
)

:: 3. Give the server 2 seconds to bind port
timeout /t 2 /nobreak >nul

:: 4. Open in Standalone App Window (Edge / Chrome borderless app mode)
echo [*] Opening MannSejro Studio in dedicated window...

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000
) else (
    start http://localhost:3000
)

echo [V] Studio is running! Keep this small window minimized while animating.
echo.
exit

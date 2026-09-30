@echo off
cd /d "%~dp0"
if exist ".steam-multiplayer\runtime\node.exe" (
 ".steam-multiplayer\runtime\node.exe" ".steam-multiplayer\src\runtime\bridge.js" --root "." --project yuanqi-knight-coop --open true
) else (
 node ".steam-multiplayer\src\runtime\bridge.js" --root "." --project yuanqi-knight-coop --open true
)
if errorlevel 1 pause

@echo off
cd /d "%~dp0"
if exist ".steam-multiplayer\runtime\node.exe" (
 ".steam-multiplayer\runtime\node.exe" ".steam-multiplayer\scripts\verify.js" --game "."  %*
) else (
 node ".steam-multiplayer\scripts\verify.js" --game "."  %*
)
exit /b %errorlevel%

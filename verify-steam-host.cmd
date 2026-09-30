@echo off
cd /d "%~dp0"
set "TEST_NODE=node"
if exist ".steam-multiplayer\runtime\node.exe" set "TEST_NODE=%~dp0.steam-multiplayer\runtime\node.exe"
"%TEST_NODE%" ".steam-multiplayer\scripts\verify-distributed.js" --game "." --role host %*
set "TEST_EXIT=%errorlevel%"
echo.
echo Test exit code: %TEST_EXIT% (0 passed, 1 failed, 2 blocked)
pause
exit /b %TEST_EXIT%

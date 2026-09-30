@echo off
cd /d "%~dp0"
set "TEST_NODE=node"
if exist ".steam-multiplayer\runtime\node.exe" set "TEST_NODE=%~dp0.steam-multiplayer\runtime\node.exe"
set "TEST_ROOM=%~1"
if not defined TEST_ROOM set /p "TEST_ROOM=Enter the host verification room code: "
if not defined TEST_ROOM exit /b 2
"%TEST_NODE%" ".steam-multiplayer\scripts\verify-distributed.js" --game "." --role worker --room "%TEST_ROOM%"
set "TEST_EXIT=%errorlevel%"
echo.
echo Test exit code: %TEST_EXIT% (0 passed, 1 failed, 2 blocked)
pause
exit /b %TEST_EXIT%

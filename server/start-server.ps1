# Start signal server in a visible cmd window with live logs
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "node index.js" -WorkingDirectory $root
Write-Output "Signal server started in a new cmd window (port 9000)"

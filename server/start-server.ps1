# Start signal server in a visible cmd window with live logs
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$wsDir = Join-Path $root "node_modules\ws"
if (-not (Test-Path $wsDir)) {
  Write-Output "Installing signaling server dependencies (ws)..."
  Push-Location $root
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install failed. Install Node.js and retry."
    Pop-Location
    exit 1
  }
  Pop-Location
}
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "node index.js" -WorkingDirectory $root
Write-Output "Signal server started in a new cmd window (port 9000)"
Write-Output "Check: http://127.0.0.1:9000/health"

# 启动信令服务器（带日志）
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $root "server.log"
$err = Join-Path $root "server.err.log"
$proc = Start-Process -FilePath "node" -ArgumentList "index.js" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
Set-Content -Path (Join-Path $root "server.pid") -Value $proc.Id
Write-Output ("PID: " + $proc.Id)

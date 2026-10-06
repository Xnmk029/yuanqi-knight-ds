param(
  [string]$ManifestUrl,
  [string]$ManifestFile,
  [string]$InviteFile,
  [string]$CacheRoot,
  [string]$Name = '画友',
  [switch]$CreateRoom,
  [string]$Topic = '今天一起画画',
  [ValidateRange(2,8)][int]$Members = 4,
  [ValidateSet('strict','trusted')][string]$Policy = 'strict',
  [string]$GuideUrl,
  [string]$Data,
  [switch]$NoOpen,
  [switch]$InstallOnly,
  [switch]$Setup,
  [ValidateSet('auto','codex','claude','cursor','vscode','gemini','generic')][string]$Agent = 'auto',
  [ValidateSet('user','project')][string]$Scope = 'user',
  [string]$ConfigFile,
  [string]$Project,
  [string]$AgentHome
)
$ErrorActionPreference = 'Stop'
if ($CreateRoom -and $InviteFile) { throw 'CreateRoom and InviteFile are mutually exclusive' }
if ($InstallOnly -and $Setup) { throw 'InstallOnly and Setup are mutually exclusive' }
if (-not $CacheRoot) { $CacheRoot = Join-Path $env:LOCALAPPDATA 'AI-Tea-Draw\releases' }
$CacheRoot = [System.IO.Path]::GetFullPath($CacheRoot)
New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null
Add-Type -AssemblyName System.Net.Http
function Get-Sha256([string]$filePath) {
  $fileStream=[System.IO.File]::OpenRead($filePath); $hashAlgorithm=[System.Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hashAlgorithm.ComputeHash($fileStream)).Replace('-','').ToLowerInvariant() } finally { $hashAlgorithm.Dispose(); $fileStream.Dispose() }
}
function Test-SafeArchivePath([string]$value) {
  if (-not $value -or $value.StartsWith('/') -or $value.Contains('\')) { return $false }
  $segments = $value.Split('/')
  for ($i=0; $i -lt $segments.Length; $i++) {
    $segment = $segments[$i]
    if ($segment -eq '' -and $i -eq $segments.Length-1) { continue }
    if (-not $segment -or $segment -match '[\x00-\x1f\x7f<>:"|?*]' -or $segment -match '[ .]$' -or $segment -eq '.' -or $segment -eq '..' -or $segment -match '^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\.|$)') { return $false }
  }
  return $true
}
function Get-BoundedDownload([Uri]$uri, [string]$target, [long]$limit) {
  $handler = [System.Net.Http.HttpClientHandler]::new(); $handler.AllowAutoRedirect=$false
  $httpClient = [System.Net.Http.HttpClient]::new($handler); $httpClient.Timeout=[TimeSpan]::FromSeconds(60)
  try {
    for ($redirect=0; $redirect -lt 6; $redirect++) {
      if ($uri.Scheme -ne 'https' -or $uri.UserInfo) { throw 'Download requires HTTPS' }
      $downloadResponse=$httpClient.GetAsync($uri,[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
      if ([int]$downloadResponse.StatusCode -in @(301,302,303,307,308)) { $next=$downloadResponse.Headers.Location; $downloadResponse.Dispose(); $uri=[Uri]::new($uri,$next); continue }
      $downloadResponse.EnsureSuccessStatusCode() | Out-Null
      if ($downloadResponse.Content.Headers.ContentLength -gt $limit) { throw 'Download too large' }
      $stream=$downloadResponse.Content.ReadAsStreamAsync().GetAwaiter().GetResult(); $destinationStream=[System.IO.File]::Create($target)
      try {
        $buffer=New-Object byte[] 32768; $downloadBytes=0L
        while ($true) {
          $readTask=$stream.ReadAsync($buffer,0,$buffer.Length)
          if (-not $readTask.Wait(30000)) { throw 'Download timeout' }
          $read=$readTask.Result; if ($read -eq 0) { break }
          $downloadBytes+=$read; if ($downloadBytes -gt $limit) { throw 'Download too large' }
          $destinationStream.Write($buffer,0,$read)
        }
      } finally { $destinationStream.Dispose(); $stream.Dispose(); $downloadResponse.Dispose() }
      return
    }
    throw 'Download redirect limit'
  } finally { $httpClient.Dispose(); $handler.Dispose() }
}
if ($ManifestFile) {
  $manifestPath = (Resolve-Path -LiteralPath $ManifestFile).Path
  if ((Get-Item -LiteralPath $manifestPath).Length -gt 32768) { throw 'Manifest too large' }
  $release = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
} else {
  $manifestUri = [Uri]$ManifestUrl
  if ($manifestUri.Scheme -ne 'https') { throw 'Manifest must use HTTPS' }
  $manifestPath=Join-Path $CacheRoot ([Guid]::NewGuid().ToString('N')+'.json')
  Get-BoundedDownload $manifestUri $manifestPath 32768
  $release=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  Remove-Item -LiteralPath $manifestPath
}
if ($release.schema -ne 1 -or $release.platform -ne 'windows-x64' -or $release.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release manifest' }
$asset = $release.variants.portable
if (-not $asset -or $asset.sha256 -notmatch '^[a-f0-9]{64}$' -or $asset.bytes -gt 100MB -or $asset.bytes -lt 1) { throw 'Invalid portable asset manifest' }
if ($ManifestUrl -and -not $ManifestFile -and $release.status -eq 'local-build' -and -not $asset.url) { throw 'RELEASE_NOT_PUBLISHED: public download URLs are not configured' }
New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null
$destination = Join-Path $CacheRoot ($release.version + '-portable-' + $asset.sha256.Substring(0,12))
$partial = $destination + '.partial-' + [Guid]::NewGuid().ToString('N')
$archive = Join-Path $CacheRoot ([Guid]::NewGuid().ToString('N') + '.zip')
if ($ManifestFile -and -not $asset.url) {
  if ([System.IO.Path]::GetFileName($asset.file) -ne $asset.file) { throw 'Invalid asset path' }
  Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $manifestPath) $asset.file) -Destination $archive
} else {
  $assetUri = if ($asset.url) { [Uri]$asset.url } else { [Uri]::new($manifestUri, $asset.file) }
  if ($assetUri.Scheme -ne 'https') { throw 'Asset must use HTTPS' }
  Get-BoundedDownload $assetUri $archive $asset.bytes
}
if ((Get-Item -LiteralPath $archive).Length -ne $asset.bytes -or (Get-Sha256 $archive) -ne $asset.sha256) { throw 'ASSET_HASH_MISMATCH' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$trustedZip = [System.IO.Compression.ZipFile]::OpenRead($archive)
try {
  $manifestEntry=$trustedZip.GetEntry('manifest.json')
  if (-not $manifestEntry -or $manifestEntry.Length -gt 65536) { throw 'Invalid packaged manifest' }
  $manifestStream=$manifestEntry.Open(); $manifestMemory=[System.IO.MemoryStream]::new()
  try { $manifestStream.CopyTo($manifestMemory); $trustedBytes=$manifestMemory.ToArray() } finally { $manifestStream.Dispose(); $manifestMemory.Dispose() }
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try { $trustedManifestHash=[BitConverter]::ToString($sha.ComputeHash($trustedBytes)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
  $fileManifest=[System.Text.Encoding]::UTF8.GetString($trustedBytes) | ConvertFrom-Json
} finally { $trustedZip.Dispose() }
if (-not (Test-Path -LiteralPath $destination)) {
  New-Item -ItemType Directory -Path $partial | Out-Null
  $zipFile = [System.IO.Compression.ZipFile]::OpenRead($archive)
  try {
    if ($zipFile.Entries.Count -gt 10000) { throw 'Too many archive entries' }
    $expandedBytes = 0L
    $prefix = [System.IO.Path]::GetFullPath($partial) + [System.IO.Path]::DirectorySeparatorChar
    $seenEntries=[System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zipFile.Entries) {
      $expandedBytes += $entry.Length
      if ($expandedBytes -gt 200MB -or $entry.Length -gt 100MB -or -not (Test-SafeArchivePath $entry.FullName) -or -not $seenEntries.Add($entry.FullName)) { throw 'Unsafe archive entry' }
      $target = [System.IO.Path]::GetFullPath((Join-Path $partial $entry.FullName))
      if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escape' }
      if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
      New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($target)) -Force | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
  } finally { $zipFile.Dispose() }
  $cachePrefix=$CacheRoot+[System.IO.Path]::DirectorySeparatorChar
  if (-not ([System.IO.Path]::GetFullPath($partial)).StartsWith($cachePrefix,[StringComparison]::OrdinalIgnoreCase) -or -not ([System.IO.Path]::GetFullPath($destination)).StartsWith($cachePrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Install target escape' }
  try { [System.IO.Directory]::Move($partial,$destination) } catch { if (-not (Test-Path -LiteralPath $destination)) { throw }; Remove-Item -LiteralPath $partial -Recurse -Force }
}
if ((Get-Sha256 (Join-Path $destination 'manifest.json')) -ne $trustedManifestHash) { throw 'INSTALL_MANIFEST_CHANGED' }
if ($fileManifest.version -ne $release.version -or $fileManifest.files.Count -gt 10000) { throw 'Invalid installed manifest' }
$installPrefix = [System.IO.Path]::GetFullPath($destination) + [System.IO.Path]::DirectorySeparatorChar
foreach ($file in $fileManifest.files) {
  if (-not (Test-SafeArchivePath $file.path)) { throw 'Invalid installed file path' }
  $target = [System.IO.Path]::GetFullPath((Join-Path $destination $file.path))
  if (-not $target.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installed file escape' }
  if ((Get-Sha256 $target) -ne $file.sha256) { throw 'INSTALL_HASH_MISMATCH' }
}
Remove-Item -LiteralPath $archive
if ($InstallOnly) { @{ ok=$true; directory=$destination } | ConvertTo-Json -Compress; exit 0 }
$nodeBinary = Join-Path $destination 'runtime\node.exe'
if (-not $GuideUrl -and $ManifestUrl) { $GuideUrl = ([Uri]::new([Uri]$ManifestUrl,'AGENT-START.md')).AbsoluteUri }
if ($Setup -or (-not $CreateRoom -and -not $InviteFile)) {
  $setupArgs = @('--agent',$Agent,'--scope',$Scope)
  if ($ConfigFile) { $setupArgs += @('--config',$ConfigFile) }
  if ($Project) { $setupArgs += @('--project',$Project) }
  if ($AgentHome) { $setupArgs += @('--home',$AgentHome) }
  if ($GuideUrl) { $setupArgs += @('--guide-url',$GuideUrl) }
  if ($CreateRoom) { $setupArgs += @('--host','--topic',$Topic,'--max-members',"$Members",'--policy',$Policy,'--name',$Name) }
  elseif ($InviteFile) { $setupArgs += @('--join','--invite-file',$InviteFile,'--name',$Name) }
  if ($CreateRoom -or $InviteFile) {
    if ($Data) { $setupArgs += @('--data',$Data) }
    if ($NoOpen) { $setupArgs += '--no-open' }
  }
  & $nodeBinary (Join-Path $destination 'scripts\onboard.js') @setupArgs
  exit $LASTEXITCODE
}
if ($CreateRoom) { $teaActionArgs = @('host','--topic',$Topic,'--max-members',"$Members",'--policy',$Policy,'--name',$Name) }
else { if (-not $InviteFile) { throw 'InviteFile required to join, or select CreateRoom' }; $teaActionArgs = @('join','--invite-file',$InviteFile,'--name',$Name) }
if ($GuideUrl) { $teaActionArgs += @('--guide-url',$GuideUrl) }
if ($Data) { $teaActionArgs += @('--data',$Data) }
if ($NoOpen) { $teaActionArgs += '--no-open' }
& $nodeBinary (Join-Path $destination 'scripts\tea.js') @teaActionArgs
exit $LASTEXITCODE

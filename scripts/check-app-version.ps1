# Read the desktop app's installed version + active session metadata.
#
# Two sources are checked:
#   1. The installed binary (registry / Get-Package) - what Windows
#      thinks is currently installed.
#   2. session.json in %APPDATA%\com.orderflowv2.desktop - what the
#      app last wrote. This includes the JWT, license, and machine ID,
#      but NOT the app version directly. The Tauri runtime sends
#      appVersion to the heartbeat endpoint via env!("CARGO_PKG_VERSION"),
#      i.e. the build-time version baked into the binary - same as #1.
#
# Useful post-update to confirm the auto-updater landed.
#
#   .\scripts\check-app-version.ps1

$ErrorActionPreference = 'Continue'

Write-Host "=== Installed package (Windows registry) ===" -ForegroundColor Cyan
$pkg = Get-Package -Name 'OrderflowV2*' -ErrorAction SilentlyContinue
if ($pkg) {
    $pkg | Format-Table Name, Version, ProviderName -AutoSize
} else {
    Write-Host "(not installed)" -ForegroundColor Yellow
}

Write-Host "=== Binary on disk ===" -ForegroundColor Cyan
$exePaths = @(
    'C:\Program Files\OrderflowV2\desktop.exe',
    'C:\Program Files\OrderflowV2\OrderflowV2.exe',
    "$env:LOCALAPPDATA\Programs\OrderflowV2\desktop.exe"
)
$found = $false
foreach ($p in $exePaths) {
    if (Test-Path $p) {
        $found = $true
        $info = Get-Item $p
        Write-Host ("  Path:  {0}" -f $info.FullName)
        Write-Host ("  Size:  {0:N0} bytes" -f $info.Length)
        Write-Host ("  Built: {0}" -f $info.LastWriteTime)
        try {
            $ver = (Get-Item $p).VersionInfo
            Write-Host ("  ProductVersion: {0}" -f $ver.ProductVersion)
            Write-Host ("  FileVersion:    {0}" -f $ver.FileVersion)
        } catch {}
        break
    }
}
if (-not $found) { Write-Host "(no binary found)" -ForegroundColor Yellow }

Write-Host "=== Session.json (active web session) ===" -ForegroundColor Cyan
$sessionPath = "$env:APPDATA\com.orderflowv2.desktop\session.json"
if (Test-Path $sessionPath) {
    try {
        $s = Get-Content $sessionPath -Raw | ConvertFrom-Json
        Write-Host ("  License key: {0}" -f $s.license.licenseKey)
        Write-Host ("  Status:      {0}" -f $s.license.status)
        Write-Host ("  Machines:    {0}/{1}" -f $s.license.activeMachines, $s.license.maxMachines)
        Write-Host ("  Token expires at: {0}" -f $s.expires_at)
    } catch {
        Write-Host "  (unreadable: $($_.Exception.Message))" -ForegroundColor Yellow
    }
} else {
    Write-Host "(no session - user is logged out)" -ForegroundColor Yellow
}

Write-Host "=== Prefs.json (UI flags) ===" -ForegroundColor Cyan
$prefsPath = "$env:APPDATA\com.orderflowv2.desktop\prefs.json"
if (Test-Path $prefsPath) {
    Get-Content $prefsPath -Raw
} else {
    Write-Host "(no prefs - welcome screen will show)" -ForegroundColor Yellow
}

# Pulse XAI — start backend API + frontend static server
# Usage:  .\run.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host ""
Write-Host "Pulse XAI — starting servers..." -ForegroundColor Cyan
Write-Host ""

# ── Backend API (port 8081) ──────────────────────────────────────────────
$env:PYTHONIOENCODING = "utf-8"
$env:PORT = "8081"

$pyExe = "python"
if (Test-Path (Join-Path $Root ".venv\Scripts\python.exe")) {
    $pyExe = Join-Path $Root ".venv\Scripts\python.exe"
}

$backendJob = Start-Job -ScriptBlock {
    param($root, $py)
    Set-Location $root
    $env:PYTHONIOENCODING = "utf-8"
    $env:PORT = "8082"
    & $py server/server.py 2>&1
} -ArgumentList $Root, $pyExe

Start-Sleep -Seconds 4

# ── Frontend static files (port 5500) ──────────────────────────────────────
$frontendJob = Start-Job -ScriptBlock {
    param($root, $py)
    Set-Location (Join-Path $root "frontend")
    & $py -m http.server 5500 2>&1
} -ArgumentList $Root, $pyExe

Start-Sleep -Seconds 2

# ── Health check ───────────────────────────────────────────────────────────
try {
    $null = Invoke-WebRequest -Uri "http://localhost:8082/login" -Method POST `
        -ContentType "application/json" `
        -Body '{"email":"health@test.com","password":"test"}' `
        -UseBasicParsing -TimeoutSec 5
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 401) {
        Write-Host "WARNING: Backend may not be ready yet. Wait a few seconds and refresh." -ForegroundColor Yellow
    }
}

$loginUrl = "http://localhost:5500/login.html"

Write-Host ""
Write-Host "  Backend API:  http://localhost:8082" -ForegroundColor Green
Write-Host "  Frontend UI:  $loginUrl" -ForegroundColor Green
Write-Host ""
Write-Host "  Open the Frontend UI link above in your browser." -ForegroundColor White
Write-Host "  Press Ctrl+C to stop both servers." -ForegroundColor DarkGray
Write-Host ""

Start-Process $loginUrl

try {
    while ($true) {
        Receive-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue | Out-Host
        Start-Sleep -Seconds 2
    }
} finally {
    Stop-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
}

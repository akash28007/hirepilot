# HirePilot - start the full local stack.
#
# Usage (from a PowerShell terminal you own):
#   .\start-dev.ps1
#
# Opens one window per service so each keeps its own logs and can be
# Ctrl+C'd independently. Run this from YOUR terminal -- processes spawned
# by tooling get reaped when that tool's process tree is cleaned up.

$root = $PSScriptRoot

$services = @(
    @{ name = "gateway";   path = "$root\backend\gateway";             cmd = "npm start";   port = 8000 },
    @{ name = "auth";      path = "$root\backend\services\auth";       cmd = "npm start";   port = 8001 },
    @{ name = "resume";    path = "$root\backend\services\resume";     cmd = "npm start";   port = 8002 },
    @{ name = "interview"; path = "$root\backend\services\interview";  cmd = "npm start";   port = 8003 },
    @{ name = "roadmap";   path = "$root\backend\services\roadmap";    cmd = "npm start";   port = 8004 },
    @{ name = "billing";   path = "$root\backend\services\billing";    cmd = "npm start";   port = 8005 },
    @{ name = "frontend";  path = "$root\frontend";                    cmd = "npm run dev"; port = 5173 }
)

# Redis lives in Docker with restart:unless-stopped, so it should already be up.
Write-Host "Checking Redis..." -ForegroundColor Cyan
$redis = docker ps --filter "name=hirepilot-redis" --format "{{.Names}}" 2>$null
if (-not $redis) {
    Write-Host "  Redis not running - starting it" -ForegroundColor Yellow
    Push-Location "$root\backend"
    docker compose up -d
    Pop-Location
} else {
    Write-Host "  Redis is up" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Cyan
foreach ($s in $services) {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='HirePilot-$($s.name)'; Set-Location '$($s.path)'; $($s.cmd)"
    Write-Host "  $($s.name) -> port $($s.port)"
}

Write-Host ""
Write-Host "Waiting for ports..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
    $up = @($services | Where-Object {
        Get-NetTCPConnection -LocalPort $_.port -State Listen -ErrorAction SilentlyContinue
    })
    if ($up.Count -eq $services.Count) { break }
    Start-Sleep -Seconds 3
}

Write-Host ""
foreach ($s in $services) {
    $listening = Get-NetTCPConnection -LocalPort $s.port -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
        Write-Host ("  {0,-5} UP    {1}" -f $s.port, $s.name) -ForegroundColor Green
    } else {
        Write-Host ("  {0,-5} DOWN  {1}" -f $s.port, $s.name) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "  http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop everything: close the HirePilot-* windows, or run .\stop-dev.ps1" -ForegroundColor DarkGray

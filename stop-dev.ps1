# HirePilot - stop the local stack.
#
# Closes the HirePilot-* service windows. Redis is left running, since it
# lives in Docker with restart:unless-stopped and is cheap to leave up.
# Pass -Redis to stop that too.

param([switch]$Redis)

$windows = @(Get-Process powershell -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like "HirePilot-*" })

if ($windows.Count -gt 0) {
    Write-Host "Stopping $($windows.Count) HirePilot service window(s)..." -ForegroundColor Cyan
    foreach ($w in $windows) {
        Write-Host "  $($w.MainWindowTitle)"
        Stop-Process -Id $w.Id -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "No HirePilot-* windows found." -ForegroundColor Yellow
    Write-Host "If services are still running they may be orphaned; check with:" -ForegroundColor DarkGray
    Write-Host "  Get-Process node" -ForegroundColor DarkGray
}

Start-Sleep -Seconds 2

Write-Host ""
foreach ($p in 5173, 8000, 8001, 8002, 8003, 8004, 8005) {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($c) {
        Write-Host ("  {0,-5} still UP" -f $p) -ForegroundColor Yellow
    } else {
        Write-Host ("  {0,-5} stopped" -f $p) -ForegroundColor Green
    }
}

if ($Redis) {
    Write-Host ""
    Write-Host "Stopping Redis..." -ForegroundColor Cyan
    Push-Location "$PSScriptRoot\backend"
    docker compose down
    Pop-Location
}

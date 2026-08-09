# Sprint 1 Milestone 2 — Database verification
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\verify-milestone-2-db.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $Root "package.json"))) {
    throw "Could not locate repository root from script path: $PSScriptRoot"
}

Set-Location -LiteralPath $Root
Write-Host "Working directory: $Root"
Write-Host ""

function Assert-LastExitOk {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    if ($null -eq $LASTEXITCODE) {
        return
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Title (exit code $LASTEXITCODE)"
    }
}

Write-Host "=== prisma generate ===" -ForegroundColor Cyan
npx prisma generate
Assert-LastExitOk -Title "prisma generate"
Write-Host ""

Write-Host "=== prisma migrate status ===" -ForegroundColor Cyan
# Status may exit non-zero when migrations are pending; still proceed to deploy.
npx prisma migrate status
Write-Host "migrate status exit code: $LASTEXITCODE (non-zero is OK if migrations are pending)"
Write-Host ""

Write-Host "=== prisma migrate deploy ===" -ForegroundColor Cyan
npx prisma migrate deploy
Assert-LastExitOk -Title "prisma migrate deploy"
Write-Host ""

Write-Host "=== prisma db seed (npm run db:seed) ===" -ForegroundColor Cyan
npm run db:seed
Assert-LastExitOk -Title "npm run db:seed"
Write-Host ""

Write-Host "=== verify PracticeArea / Language / PlatformSetting counts and bookings columns ===" -ForegroundColor Cyan
npx tsx .\scripts\verify-milestone-2-db-checks.ts
Assert-LastExitOk -Title "verify-milestone-2-db-checks.ts"
Write-Host ""

Write-Host "Milestone 2 database verification completed successfully." -ForegroundColor Green

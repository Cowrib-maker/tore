# Requires Administrator
# Initializes PostgreSQL 17 cluster under Program Files, creates tore DB, runs Prisma verify.
$ErrorActionPreference = "Stop"
$LogFile = "C:\Users\user\Projects\tore\scripts\pg-admin-init.log"
function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "o"), $msg
  Add-Content -LiteralPath $LogFile -Value $line
  Write-Host $msg
}

try {
  if (Test-Path $LogFile) { Remove-Item -LiteralPath $LogFile -Force }
  Log "START admin init"

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Not running as Administrator"
  }
  Log "Running as Administrator"

  $repo = "C:\Users\user\Projects\tore"
  Set-Location -LiteralPath $repo

  $pgRoot = "C:\Program Files\PostgreSQL\17"
  $bin = Join-Path $pgRoot "bin"
  $psql = Join-Path $bin "psql.exe"
  $initdb = Join-Path $bin "initdb.exe"
  $pgCtl = Join-Path $bin "pg_ctl.exe"
  $dataDir = Join-Path $pgRoot "data"
  $serviceName = "postgresql-x64-17"

  foreach ($tool in @($psql, $initdb, $pgCtl)) {
    if (-not (Test-Path $tool)) { throw "Missing tool: $tool" }
  }

  $envFile = Join-Path $repo ".env"
  $line = (Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
  if (-not $line) { throw "DATABASE_URL missing in .env" }
  $uri = ($line -replace '^DATABASE_URL=', '' -replace '"', '').Trim()
  if ($uri -notmatch 'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') {
    throw "Could not parse DATABASE_URL"
  }
  $dbUser = $Matches[1]
  $dbPass = $Matches[2]
  $dbHost = $Matches[3]
  $dbPort = $Matches[4]
  $dbName = $Matches[5]
  Log "Target user=$dbUser host=$dbHost port=$dbPort db=$dbName (password not logged)"

  if (-not (Test-Path $dataDir)) {
    Log "STEP: initdb"
    $pwFile = Join-Path $env:TEMP ("tore-pg-pw-" + [guid]::NewGuid().ToString() + ".txt")
    try {
      [System.IO.File]::WriteAllText($pwFile, $dbPass)
      & $initdb -D $dataDir -U $dbUser -E UTF8 --locale=C --auth=scram-sha-256 --pwfile=$pwFile
      if ($LASTEXITCODE -ne 0) { throw "initdb exit code $LASTEXITCODE" }
    }
    finally {
      if (Test-Path $pwFile) { Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue }
    }
    Log "STEP OK: initdb"

    $conf = Join-Path $dataDir "postgresql.conf"
    $confText = Get-Content -LiteralPath $conf -Raw
    $confText = $confText -replace "(?m)^#?port\s*=\s*.*$", "port = $dbPort"
    $confText = $confText -replace "(?m)^#?listen_addresses\s*=\s*.*$", "listen_addresses = 'localhost'"
    if ($confText -notmatch "(?m)^port\s*=") {
      $confText += "`r`nport = $dbPort`r`n"
    }
    if ($confText -notmatch "(?m)^listen_addresses\s*=") {
      $confText += "`r`nlisten_addresses = 'localhost'`r`n"
    }
    Set-Content -LiteralPath $conf -Value $confText -NoNewline
    Log "Configured postgresql.conf"
  }
  else {
    Log "Data directory already exists; skipping initdb"
  }

  $existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  if (-not $existing) {
    Log "STEP: pg_ctl register"
    & $pgCtl register -N $serviceName -D $dataDir
    if ($LASTEXITCODE -ne 0) { throw "pg_ctl register exit code $LASTEXITCODE" }
  }
  else {
    Log "Service already registered: $serviceName"
  }

  Set-Service -Name $serviceName -StartupType Automatic
  $svc = Get-Service -Name $serviceName
  if ($svc.Status -ne 'Running') {
    Log "STEP: Start-Service $serviceName"
    Start-Service -Name $serviceName
  }
  $svc = Get-Service -Name $serviceName
  Log "Service status=$($svc.Status) StartType=$($svc.StartType)"
  if ($svc.Status -ne 'Running') { throw "Service not running after Start-Service" }

  $env:PGPASSWORD = $dbPass
  $ready = $false
  for ($i = 1; $i -le 45; $i++) {
    & $psql -U $dbUser -h $dbHost -p $dbPort -d postgres -c "SELECT 1;" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
    Log "Waiting for readiness... ($i)"
  }
  if (-not $ready) { throw "PostgreSQL did not become ready" }
  Log "STEP OK: accepting connections"

  $exists = (& $psql -U $dbUser -h $dbHost -p $dbPort -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName'").Trim()
  if ($exists -eq '1') {
    Log "Database '$dbName' already exists"
  }
  else {
    Log "STEP: CREATE DATABASE $dbName"
    & $psql -U $dbUser -h $dbHost -p $dbPort -d postgres -c "CREATE DATABASE `"$dbName`";"
    if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE exit code $LASTEXITCODE" }
  }

  Log "STEP: psql verify"
  & $psql -U $dbUser -h $dbHost -p $dbPort -d $dbName -c "SELECT current_database() AS db, version();"
  if ($LASTEXITCODE -ne 0) { throw "psql verify exit code $LASTEXITCODE" }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

  Log "STEP: prisma generate"
  Set-Location -LiteralPath $repo
  npx prisma generate
  if ($LASTEXITCODE -ne 0) { throw "prisma generate exit code $LASTEXITCODE" }

  Log "STEP: prisma migrate deploy"
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy exit code $LASTEXITCODE" }

  Log "STEP: npm run db:seed"
  npm run db:seed
  if ($LASTEXITCODE -ne 0) { throw "db:seed exit code $LASTEXITCODE" }

  Log "STEP: verify-milestone-2-db.ps1"
  powershell -ExecutionPolicy Bypass -File "$repo\scripts\verify-milestone-2-db.ps1"
  if ($LASTEXITCODE -ne 0) { throw "verify-milestone-2-db.ps1 exit code $LASTEXITCODE" }

  Log "ALL_STEPS_OK"
}
catch {
  Log ("FAILED: " + $_.Exception.Message)
  exit 1
}

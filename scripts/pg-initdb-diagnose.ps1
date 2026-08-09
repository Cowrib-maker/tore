$ErrorActionPreference = "Continue"
$log = "C:\Users\user\Projects\tore\scripts\pg-initdb-error.log"
"START" | Set-Content $log
$pgRoot = "C:\Program Files\PostgreSQL\17"
$initdb = Join-Path $pgRoot "bin\initdb.exe"
$dataDir = Join-Path $pgRoot "data"
"dataDir exists=$(Test-Path $dataDir)" | Add-Content $log
Get-Acl $pgRoot | Format-List | Out-String | Add-Content $log
$line = (Get-Content "C:\Users\user\Projects\tore\.env" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
$uri = ($line -replace '^DATABASE_URL=','' -replace '"','').Trim()
$null = $uri -match 'postgresql://([^:]+):([^@]+)@'
$dbUser = $Matches[1]
$dbPass = $Matches[2]
$pwFile = Join-Path $env:TEMP ("tore-pg-pw-" + [guid]::NewGuid() + ".txt")
[System.IO.File]::WriteAllText($pwFile, $dbPass)
$all = & $initdb -D $dataDir -U $dbUser -E UTF8 --locale=C --auth=scram-sha-256 --pwfile=$pwFile 2>&1 | Out-String
Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
"EXIT=$LASTEXITCODE" | Add-Content $log
$all | Add-Content $log

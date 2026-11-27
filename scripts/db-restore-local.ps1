# Rebuilds the LOCAL Supabase database from a production dump made by
# db-pull-prod.ps1, then runs supabase/local/post-restore.sql.
# Wipes the local database only; never touches production.
#
# Usage:
#   npm run db:restore                                  # latest dump, test password
#   powershell -File scripts/db-restore-local.ps1 -Dump supabase/.dumps/20261127-090000
#   powershell -File scripts/db-restore-local.ps1 -KeepPasswords     # keep prod passwords

param(
  [string] $Dump = 'supabase/.dumps/latest',
  [string] $TestPassword = 'taskapp123',
  [switch] $KeepPasswords
)

$ErrorActionPreference = 'Stop'
if ($KeepPasswords) { $TestPassword = '' }
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dumpDir = Resolve-Path $Dump
foreach ($f in 'roles.sql', 'schema.sql', 'data.sql') {
  if (-not (Test-Path (Join-Path $dumpDir $f))) { throw "Missing $f in $dumpDir. Run npm run db:pull first." }
}

$container = 'supabase_db_taskapp'
$running = docker ps --filter "name=^$container$" --format '{{.Names}}'
if ($running -ne $container) { throw "Local Supabase is not running. Run: npx supabase start" }

Write-Host '==> Resetting local database (migrations and seed are disabled in config)'
& npx supabase db reset
if ($LASTEXITCODE -ne 0) { throw 'supabase db reset failed' }

Write-Host '==> Copying dump into the container'
docker exec $container rm -rf /tmp/restore | Out-Null
docker exec $container mkdir -p /tmp/restore | Out-Null
foreach ($f in 'roles.sql', 'schema.sql', 'data.sql') {
  docker cp (Join-Path $dumpDir $f) "${container}:/tmp/restore/$f" | Out-Null
}
docker cp (Join-Path $root 'supabase/local/post-restore.sql') "${container}:/tmp/restore/post-restore.sql" | Out-Null
docker cp (Join-Path $root 'supabase/local/filter-data.awk') "${container}:/tmp/restore/filter-data.awk" | Out-Null

# Keep only auth.users/identities and drop empty COPY blocks, so a newer
# production auth/storage schema does not break the restore.
docker exec $container sh -c 'awk -f /tmp/restore/filter-data.awk /tmp/restore/data.sql > /tmp/restore/data.filtered.sql'
if ($LASTEXITCODE -ne 0) { throw 'Filtering data.sql failed' }

Write-Host '==> Restoring (single transaction)'
# -o /dev/null hides query results (setval rows); PGOPTIONS hides NOTICEs.
docker exec -e PGPASSWORD=postgres -e 'PGOPTIONS=-c client_min_messages=warning' $container `
  psql -h 127.0.0.1 -U supabase_admin -d postgres `
  --single-transaction -v ON_ERROR_STOP=1 -q -o /dev/null `
  -v "test_password=$TestPassword" `
  -f /tmp/restore/roles.sql `
  -f /tmp/restore/schema.sql `
  -c 'SET session_replication_role = replica' `
  -f /tmp/restore/data.filtered.sql `
  -c 'SET session_replication_role = origin' `
  -f /tmp/restore/post-restore.sql
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; the local database was left empty.' }

docker exec $container rm -rf /tmp/restore | Out-Null

# PostgREST caches the schema; reload it so new tables/RPCs are visible.
docker exec -e PGPASSWORD=postgres $container psql -h 127.0.0.1 -U supabase_admin -d postgres -q -c "NOTIFY pgrst, 'reload schema'" | Out-Null

Write-Host '==> Done. Local DB now mirrors production.'
if ($TestPassword) { Write-Host "    Every account's password is: $TestPassword" }
Write-Host '    Studio: http://127.0.0.1:54323   API: http://127.0.0.1:54321'

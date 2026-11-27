# Dumps the PRODUCTION database (roles, public schema, data) into
# supabase/.dumps/<timestamp>/ and copies it to supabase/.dumps/latest/.
# Read-only on production. The dump contains employee data: it is git-ignored,
# do not share it.
#
# Connection (one of):
#   $env:SUPABASE_DB_URL = "postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"
#     (Supabase Dashboard > Connect > Session pooler)
#   or nothing: uses the linked project and prompts for the DB password
#     (or reads $env:SUPABASE_DB_PASSWORD).
#
# Usage: npm run db:pull

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path $root "supabase/.dumps/$stamp"
New-Item -ItemType Directory -Force $dir | Out-Null

if ($env:SUPABASE_DB_URL) {
  $target = @('--db-url', $env:SUPABASE_DB_URL)
} else {
  $target = @('--linked')
}

# Tables never copied:
#  - public.zalo_oa_tokens: the OA refresh token rotates; using it locally
#    would invalidate production's token.
#  - cron jobs: they call the production Edge Function.
#  - auth.audit_log_entries: large and useless for testing.
#  - storage vector tables: not supported by the local stack.
$exclude = @(
  '-x', 'public.zalo_oa_tokens',
  '-x', 'cron.job',
  '-x', 'cron.job_run_details',
  '-x', 'auth.audit_log_entries',
  '-x', 'storage.buckets_vectors',
  '-x', 'storage.vector_indexes'
)

function Invoke-Dump([string[]] $dumpArgs) {
  & npx supabase db dump @target @dumpArgs
  if ($LASTEXITCODE -ne 0) { throw "supabase db dump failed ($dumpArgs)" }
}

Write-Host '==> Dumping roles'
Invoke-Dump @('--role-only', '-f', "$dir/roles.sql")
Write-Host '==> Dumping schema'
Invoke-Dump @('-f', "$dir/schema.sql")
Write-Host '==> Dumping data'
Invoke-Dump (@('--data-only', '--use-copy', '-f', "$dir/data.sql") + $exclude)

$latest = Join-Path $root 'supabase/.dumps/latest'
if (Test-Path $latest) { Remove-Item -Recurse -Force $latest }
Copy-Item -Recurse $dir $latest

Write-Host "==> Done: $dir (also copied to supabase/.dumps/latest)"
Write-Host '    Next: npm run db:restore'

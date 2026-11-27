# Filters a `supabase db dump --data-only --use-copy` file before it is
# restored locally (used by scripts/db-restore-local.ps1).
#
# The production auth/storage services are often newer than the local
# images, so their internal tables can have extra columns. To keep the
# restore working across versions:
#  - from the `auth` schema only `users` and `identities` are kept
#    (sessions and refresh tokens are useless locally: the JWT secret differs);
#  - COPY blocks with no rows are dropped (they are no-ops anyway).

function keep_table(line) {
  if (line ~ /^COPY "auth"\./) {
    return line ~ /^COPY "auth"\."(users|identities)" /
  }
  return 1
}

{ sub(/\r$/, "") }

# Inside a skipped block: drop lines until the terminator.
skipping {
  if ($0 == "\\.") skipping = 0
  next
}

# A COPY header is buffered until we know whether the block has rows.
/^COPY / {
  if (!keep_table($0)) { skipping = 1; next }
  pending = $0
  next
}

pending != "" {
  if ($0 == "\\.") { pending = ""; next }   # empty block
  print pending
  pending = ""
}

{ print }

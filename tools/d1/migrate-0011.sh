#!/usr/bin/env bash
# Guarded, one-time application of migrations/0011_verification.sql to the D1 database wavelength-volunteers.
# Run by .github/workflows/d1-migration-0011.yml (production, --remote). Test it locally with --local (see the
# header of that workflow). Every check that fails stops the run with a ::error:: line and a non-zero exit.
#
# Order:
#   1. The migration file is byte-for-byte the reviewed one (SHA-256).
#   2. Preflight: refuse if learners.email_status already exists, or if any part of 0011 is already present.
#   3. Counts before: learners (required), and signoffs, assessments, supervisor_links, logbook_entries.
#   4. Recovery reference, immediately before the migration: the UTC time and (remote) the D1 Time Travel bookmark.
#   5. Apply only the migration file.
#   6. Verify: counts unchanged, every learner is legacy_unverified, 7 new tables, 6 new columns, key indexes.
#
# It reads and writes no secrets: wrangler takes CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the
# environment, and nothing here echoes them. Never add `set -x`.
set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in --remote|--local) ;; *) echo "Usage: $0 --remote|--local" >&2; exit 2 ;; esac
DB="${D1_DATABASE:-wavelength-volunteers}"
MIGRATION="${MIGRATION_FILE:-migrations/0011_verification.sql}"
# SHA-256 of migrations/0011_verification.sql at PR #7 commit e6ebfdc (the reviewed version).
EXPECTED_SHA256="${EXPECTED_SHA256:-9c56f28bb861c150801b4a27b316e8800f0f3ee819f9790fe6283d94105da379}"
WRANGLER="${WRANGLER:-npx --yes wrangler@4.147.0}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
OUT="${OUT_DIR:-$(mktemp -d)}"
mkdir -p "$OUT"

say() { echo "$*"; echo "$*" >> "$SUMMARY"; }
fail() { echo "::error::$*"; echo "- **FAILED:** $*" >> "$SUMMARY"; exit 1; }

# Run one SQL statement and keep its JSON. Wrangler's own error text (never the token) is shown on failure.
q() {
  local name="$1" sql="$2"
  if ! $WRANGLER d1 execute "$DB" "$TARGET" --json --command "$sql" > "$OUT/$name.json" 2> "$OUT/$name.err"; then
    sed -n '1,40p' "$OUT/$name.err" >&2
    fail "Query '$name' failed against $DB ($TARGET)."
  fi
  jq -e '.[0].results' "$OUT/$name.json" > /dev/null || fail "Query '$name' returned no results array."
}
val() { jq -r "$2" "$OUT/$1.json"; }
int() { local v; v="$(val "$1" "$2")"; [[ "$v" =~ ^[0-9]+$ ]] || fail "Expected a number from '$1', got '$v'."; echo "$v"; }
columns() { q "cols_$1" "PRAGMA table_info($1);"; val "cols_$1" '.[0].results[].name'; }
# Not a pipeline: a failed query must stop the script, never read as "column absent". `exit` (not `return`)
# because set -e does not apply inside an `if` condition.
has_column() { local c; c="$(columns "$1")" || exit 1; grep -qx "$2" <<< "$c"; }

NEW_TABLES=(email_tokens professional_registrations credentials credential_evidence supervisor_approvals verification_events directory_profiles)
NEW_COLUMNS=(learners:email_status learners:email_verified_at supervisor_links:invite_hash supervisor_links:invite_expires signoffs:supervisor_snapshot assessments:supervisor_snapshot)
NEW_INDEXES=(email_tokens_learner supervisor_links_invite prof_reg_one_per_regulator prof_reg_one_verified_holder approvals_one_live events_learner)
COUNTED=(learners signoffs assessments supervisor_links logbook_entries)
in_list() { local IFS=,; echo "'${*}'" | sed "s/,/','/g"; }

say "### D1 migration 0011 ($DB, ${TARGET#--})"

# 1. The file is the reviewed one.
[ -f "$MIGRATION" ] || fail "Migration file $MIGRATION not found."
actual_sha="$(sha256sum "$MIGRATION" | cut -d' ' -f1)"
[ "$actual_sha" = "$EXPECTED_SHA256" ] || fail "Migration file SHA-256 is $actual_sha, expected $EXPECTED_SHA256 (the reviewed version). No SQL was run."
say "- Migration file: \`$MIGRATION\`, SHA-256 matches the reviewed version"

# 2. Preflight: nothing of 0011 may exist yet.
if has_column learners email_status; then
  fail "learners.email_status already exists: migration 0011 appears to be applied already. No SQL was run."
fi
for spec in "${NEW_COLUMNS[@]}"; do
  if has_column "${spec%%:*}" "${spec##*:}"; then fail "Column ${spec/:/.} already exists: the database is partly migrated. Stop and investigate. No SQL was run."; fi
done
q pre_tables "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ($(in_list "${NEW_TABLES[@]}"));"
existing="$(val pre_tables '[.[0].results[].name] | join(", ")')"
[ -z "$existing" ] || fail "Tables from 0011 already exist ($existing): the database is partly migrated. Stop and investigate. No SQL was run."
say "- Preflight: no part of 0011 is present"

# 3. Counts before.
declare -A BEFORE
for t in "${COUNTED[@]}"; do
  q "before_$t" "SELECT COUNT(*) AS n FROM $t;"
  BEFORE[$t]="$(int "before_$t" '.[0].results[0].n')"
done
say "- Learners before: ${BEFORE[learners]}"
say "- Other rows before: signoffs ${BEFORE[signoffs]}, assessments ${BEFORE[assessments]}, supervisor_links ${BEFORE[supervisor_links]}, logbook_entries ${BEFORE[logbook_entries]}"

# 4. Recovery reference, immediately before the migration.
recovery_ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "$recovery_ts" > "$OUT/recovery_timestamp.txt"
say "- **Recovery timestamp (UTC, immediately before migration): $recovery_ts**"
if [ "$TARGET" = "--remote" ]; then
  # The current Time Travel bookmark. Required: without a restore point the migration does not run.
  if ! $WRANGLER d1 time-travel info "$DB" --json > "$OUT/bookmark.json" 2> "$OUT/bookmark.err"; then
    sed -n '1,40p' "$OUT/bookmark.err" >&2
    fail "Could not read the D1 Time Travel bookmark. No SQL was run."
  fi
  bookmark="$(jq -r '.bookmark // empty' "$OUT/bookmark.json")"
  [ -n "$bookmark" ] || fail "Time Travel returned no bookmark. No SQL was run."
  echo "$bookmark" > "$OUT/recovery_bookmark.txt"
  say "- **Time Travel bookmark before migration: $bookmark**"
  say "- Restore if needed (owner approval first): \`wrangler d1 time-travel restore $DB --bookmark=$bookmark\` (or \`--timestamp=$recovery_ts\`)"
else
  say "- Time Travel bookmark: not available for a local database"
fi

# 5. Apply only the migration file.
if ! $WRANGLER d1 execute "$DB" "$TARGET" --yes --file "$MIGRATION" > "$OUT/apply.log" 2>&1; then
  sed -n '1,60p' "$OUT/apply.log" >&2
  fail "Applying $MIGRATION failed. Check the database state before anything else. Recovery reference: $recovery_ts"
fi
say "- Applied \`$MIGRATION\`"

# 6. Verify.
for t in "${COUNTED[@]}"; do
  q "after_$t" "SELECT COUNT(*) AS n FROM $t;"
  after="$(int "after_$t" '.[0].results[0].n')"
  [ "$after" = "${BEFORE[$t]}" ] || fail "Row count of $t changed from ${BEFORE[$t]} to $after."
done
say "- Learners after: ${BEFORE[learners]} (unchanged); other counts unchanged"

q legacy "SELECT COUNT(*) AS total, SUM(CASE WHEN email_status = 'legacy_unverified' THEN 1 ELSE 0 END) AS legacy, SUM(CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified_at FROM learners;"
total="$(int legacy '.[0].results[0].total')"
legacy="$(val legacy '.[0].results[0].legacy // 0')"; [ "$legacy" = "null" ] && legacy=0
verified_at="$(val legacy '.[0].results[0].verified_at // 0')"; [ "$verified_at" = "null" ] && verified_at=0
[ "$legacy" = "$total" ] || fail "Only $legacy of $total learners have email_status = 'legacy_unverified'."
[ "$verified_at" = "0" ] || fail "$verified_at learners unexpectedly have email_verified_at set."
say "- Existing learners marked legacy_unverified: $legacy of $total"

q post_tables "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ($(in_list "${NEW_TABLES[@]}"));"
found="$(val post_tables '.[0].results | length')"
for t in "${NEW_TABLES[@]}"; do
  jq -e --arg t "$t" '.[0].results[] | select(.name == $t)' "$OUT/post_tables.json" > /dev/null || fail "Table $t is missing after the migration."
done
say "- Verification tables present: $found of ${#NEW_TABLES[@]}"

for spec in "${NEW_COLUMNS[@]}"; do
  has_column "${spec%%:*}" "${spec##*:}" || fail "Column ${spec/:/.} is missing after the migration."
done
say "- New columns present: ${#NEW_COLUMNS[@]} of ${#NEW_COLUMNS[@]} (learners, supervisor_links, signoffs, assessments)"

q post_indexes "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ($(in_list "${NEW_INDEXES[@]}"));"
for i in "${NEW_INDEXES[@]}"; do
  jq -e --arg i "$i" '.[0].results[] | select(.name == $i)' "$OUT/post_indexes.json" > /dev/null || fail "Index $i is missing after the migration."
done
say "- Key indexes present, including the partial unique indexes"

say "- **Result: migration 0011 applied and verified.** PROFESSIONAL_VERIFY and DIRECTORY_PUBLIC are unchanged (this job does not deploy or change Worker settings)."

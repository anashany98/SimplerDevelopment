#!/bin/sh
# TEMPORARY boot diagnostic (used by docker-compose.debug.yml).
# Prints environment facts (CPU, host memory, cgroup limit) and captures the
# exit code of every boot phase â€” 137 = SIGKILL (usually cgroup OOM), 139 =
# SIGSEGV, 1 = app-level error. On failure it parks in `sleep` so the failed
# state stays inspectable via `docker logs` (and the Coolify logs API) instead
# of looping through container restarts. Delete together with
# docker-compose.debug.yml after the investigation.

echo "[diag] nproc=$(nproc 2>/dev/null || echo '?')"
echo "[diag] host meminfo:"
head -3 /proc/meminfo 2>/dev/null
echo "[diag] cgroup memory.max: $(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo 'unset')"
echo "[diag] cgroup memory.current: $(cat /sys/fs/cgroup/memory.current 2>/dev/null || echo 'unset')"

echo "[boot] 1/6 bun install"
bun install --frozen-lockfile --linker=hoisted
RC=$?
echo "[diag] step1(install) rc=$RC"
if [ "$RC" -ne 0 ]; then sleep 3600; fi

echo "[boot] 2/6 verify db target"
bun scripts/verify-db-target.ts
RC=$?
echo "[diag] step2(verify) rc=$RC"
if [ "$RC" -ne 0 ]; then sleep 3600; fi

echo "[boot] 3/6 drizzle migrate"
head -2 /proc/meminfo 2>/dev/null
bunx drizzle-kit migrate > /tmp/mig.log 2>&1
RC=$?
echo "[diag] step3(migrate) rc=$RC size=$(wc -c < /tmp/mig.log 2>/dev/null) bytes"
echo "[diag] migrate log (last 60):"
tr -d '\r' < /tmp/mig.log 2>/dev/null | tail -200
if [ "$RC" -ne 0 ]; then
  echo "[diag] migrate failed â€” recreating the (empty, half-migrated) database and retrying once"
  bun scripts/debug-recreate-db.ts
  bunx drizzle-kit migrate > /tmp/mig2.log 2>&1
  RC=$?
  echo "[diag] retry(migrate) rc=$RC size=$(wc -c < /tmp/mig2.log 2>/dev/null) bytes"
  echo "[diag] retry log (last 60):"
  tr -d '\r' < /tmp/mig2.log 2>/dev/null | tail -200
  if [ "$RC" -ne 0 ]; then sleep 3600; fi
fi
head -2 /proc/meminfo 2>/dev/null

echo "[boot] 4/6 manual migrations"
bun scripts/apply-local-manual-migrations.ts
RC=$?
echo "[diag] step4(manual) rc=$RC"
if [ "$RC" -ne 0 ]; then sleep 3600; fi

if [ -f .next/BUILD_ID ]; then
  echo "[boot] 5/6 reusing existing .next build (debug: hash check skipped)"
else
  echo "[boot] 5/6 building next (NEXT_BUILD_CPUS=${NEXT_BUILD_CPUS:-unset}; NODE_OPTIONS=--max-old-space-size=2048)"
  head -2 /proc/meminfo 2>/dev/null
  find .next -mindepth 1 -delete 2>/dev/null || true
  NODE_OPTIONS="--max-old-space-size=2048" node node_modules/next/dist/bin/next build
  RC=$?
  echo "[diag] step5(build) rc=$RC"
  head -2 /proc/meminfo 2>/dev/null
  if [ "$RC" -ne 0 ]; then sleep 3600; fi
  # Persist the same stamps the production boot uses, so the real compose
  # reuses this build instead of rebuilding (and risking another OOM).
  find . -name node_modules -prune -o -name .next -prune -o -name next-env.d.ts -prune -o -type f -exec sha256sum {} + | sort | sha256sum | cut -d' ' -f1 > .next/.src-hash
  env | grep -E '^(NEXT_PUBLIC_|AUTH_GOOGLE_|GOOGLE_CLIENT_)' | sort > .next/.env-stamp
  echo "[diag] build stamps written (.src-hash + .env-stamp)"
fi

echo "[boot] 6/6 starting next server"
node node_modules/next/dist/bin/next start
RC=$?
echo "[diag] step6(start) rc=$RC"
sleep 3600

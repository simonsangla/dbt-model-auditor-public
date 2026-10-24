#!/usr/bin/env bash
# dbt-auditor-check.sh -- standalone security scan & no-credential runtime probe
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

pass=0
fail=0
ok()  { pass=$((pass + 1)); printf 'PASS  %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL  %s\n' "$1"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/dbt-auditor-check.XXXXXX")"
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

finish() {
  printf '\nRESULT: %s (%d passed, %d failed)\n' \
    "$([ "$fail" -eq 0 ] && echo PASS || echo FAIL)" "$pass" "$fail"
  exit $(( fail > 0 ))
}

# 1. Personal identifier scan
PERSONAL='USER\$[A-Z]|/Users/|/home/[a-z]+/|[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook)\.com'
hits="$WORK/hits.txt"
(cd "$ROOT" && grep -rInE "$PERSONAL" --exclude=package-lock.json --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude="dbt-auditor-check.sh" . 2>/dev/null) | while IFS=: read -r file line content; do
  printf '%s:%s\n' "$file" "$line"
done > "$hits"

if [ -s "$hits" ]; then
  bad "personal identifier found at $(sort -u "$hits" | tr '\n' ' ')"
else
  ok "no personal identifier in codebase"
fi

# 2. No-credential runtime probe
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
EMPTY_HOME="$WORK/home"
mkdir -p "$EMPTY_HOME"

( cd "$ROOT" && \
  for v in $(env | grep -oE '^SNOWFLAKE_[A-Z_]+' ); do unset "$v"; done; \
  HOME="$EMPTY_HOME" PORT="$PORT" HOSTNAME=127.0.0.1 NODE_ENV=production npx next start -p "$PORT" ) > "$WORK/server.log" 2>&1 &
SERVER_PID=$!
B="http://127.0.0.1:$PORT"
up=0
for _ in $(seq 1 60); do
  curl -s -o /dev/null "$B/" && { up=1; break; }
  sleep 0.5
done

if [ "$up" -eq 1 ]; then
  ok "standalone server started with no credentials"
else
  bad "server failed to start"
  tail -n 20 "$WORK/server.log" | sed 's/^/      /'
  finish
fi

# 3. Route probing
for r in / /setup /cortex /battery /docs; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$B$r")
  [ "$code" = "200" ] && ok "page $r renders (200)" || bad "page $r returned $code"
done

for r in /portal /advisor /converter; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$B$r")
  [ "$code" = "404" ] && ok "removed route $r is gone (404)" || bad "removed route $r returned $code"
done

# 4. API probes
expect() {
  label="$1"; want="$2"; forbid="$3"; shift 3
  body="$WORK/body.json"
  code=$(curl -s -o "$body" -w '%{http_code}' "$@")
  if [ "$code" != "$want" ]; then
    bad "$label: expected $want, got $code ($(head -c 200 "$body"))"
  elif [ -n "$forbid" ] && grep -qE "$forbid" "$body"; then
    bad "$label: status $code but body contains a result ($(head -c 200 "$body"))"
  else
    ok "$label ($code)"
  fi
}
INVENTED='"score"|"readinessScore"|"searchServices"|"findings"|"output"'
expect "audit without credentials fails, no score"      502 "$INVENTED" "$B/api/audit?db=DB&schema=S&wh=WH"
expect "audit rejects a non-identifier schema"          400 "$INVENTED" "$B/api/audit?db=DB&schema=X%27%20OR%201%3D1&wh=WH"
expect "cortex-infra without a target is refused"       400 "$INVENTED" "$B/api/cortex-infra"
expect "cortex-infra without credentials fails"         502 "$INVENTED" "$B/api/cortex-infra?db=NOPE&schema=NOPE&wh=NOPE"
expect "cortex LLM without credentials fails"           502 "$INVENTED" -X POST -H 'content-type: application/json' \
  -d '{"modelName":"m","sqlCode":"select 1","task":"document"}' "$B/api/cortex"
expect "cortex LLM rejects a model outside allowlist"   400 "$INVENTED" -X POST -H 'content-type: application/json' \
  -d '{"modelName":"m","sqlCode":"select 1","task":"document","cortexModel":"x'"'"') --"}' "$B/api/cortex"
expect "warehouse discovery without credentials fails"  500 '"warehouses"' "$B/api/setup/warehouses"

finish

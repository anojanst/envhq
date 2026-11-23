#!/usr/bin/env bash
# End-to-end check of the self-hosted image (self-hosting phase 6).
#
#   deploy/e2e/selfhost-smoke.sh [image]        # default image: envhq:e2e
#
# Starts Postgres, a throwaway OpenID Connect provider and the EnvHQ image on
# the host network, then: waits for /api/health, signs in through the real
# OIDC redirect flow (state, nonce, PKCE) with curl, creates a team with the
# session cookie, mints an API token, and runs the published CLI against the
# instance with ENVHQ_URL. Cleans up after itself. Needs docker, curl, node.
set -euo pipefail

IMAGE="${1:-envhq:e2e}"
OIDC_IMAGE="ghcr.io/navikt/mock-oauth2-server:2.2.1"
PG_IMAGE="postgres:17"
CLI_VERSION="${ENVHQ_CLI_VERSION:-0.11.0}"
PREFIX="envhq-smoke-$$"
APP_PORT="${APP_PORT:-3000}"
PG_PORT="${PG_PORT:-5432}"
OIDC_PORT="${OIDC_PORT:-8080}"
APP="http://localhost:$APP_PORT"
ISSUER="http://localhost:$OIDC_PORT/default"
JAR="$(mktemp)"
fail() { echo "✖ $*" >&2; exit 1; }
cleanup() {
  docker rm -f "$PREFIX-app" "$PREFIX-db" "$PREFIX-oidc" >/dev/null 2>&1 || true
  rm -f "$JAR"
}
trap cleanup EXIT
dump_logs() { echo "--- app logs ---"; docker logs "$PREFIX-app" 2>&1 | tail -50 || true; }
trap 'dump_logs' ERR

for port in "$APP_PORT" "$PG_PORT" "$OIDC_PORT"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then fail "port $port is in use"; fi
done

docker run -d --name "$PREFIX-db" --network host \
  -e POSTGRES_USER=envhq -e POSTGRES_PASSWORD=envhq -e POSTGRES_DB=envhq "$PG_IMAGE" -c "port=$PG_PORT" >/dev/null
docker run -d --name "$PREFIX-oidc" --network host -e "SERVER_PORT=$OIDC_PORT" "$OIDC_IMAGE" >/dev/null

until docker exec "$PREFIX-db" pg_isready -U envhq -d envhq -p "$PG_PORT" >/dev/null 2>&1; do sleep 1; done
until curl -sf "$ISSUER/.well-known/openid-configuration" >/dev/null; do sleep 1; done

docker run -d --name "$PREFIX-app" --network host \
  -e "DATABASE_URL=postgres://envhq:envhq@localhost:$PG_PORT/envhq" \
  -e "OIDC_ISSUER=$ISSUER" \
  -e OIDC_CLIENT_ID=envhq-smoke -e OIDC_CLIENT_SECRET=smoke-secret \
  -e SESSION_SECRET=smoke-session-secret-0123456789abcdefghij \
  -e "ENVHQ_PUBLIC_URL=$APP" -e "PORT=$APP_PORT" \
  "$IMAGE" >/dev/null

echo "… waiting for /api/health"
for _ in $(seq 1 90); do
  curl -sf $APP/api/health >/dev/null && break
  sleep 2
done
curl -sf $APP/api/health >/dev/null || fail "health check never passed"
echo "✔ healthy (migrations applied on start)"

# Signed out, a page sends you to sign in.
loc=$(curl -s -o /dev/null -w '%{redirect_url}' $APP/dashboard)
[[ "$loc" == *"/sign-in?redirect_url=%2Fdashboard"* ]] || fail "dashboard didn't redirect to sign-in: $loc"
echo "✔ signed-out visitors are sent to sign in"

# Start sign-in: EnvHQ → provider's authorize endpoint, with PKCE.
authorize=$(curl -s -c "$JAR" -b "$JAR" -o /dev/null -w '%{redirect_url}' "$APP/auth/sign-in?redirect_url=/teams")
[[ "$authorize" == $ISSUER/authorize* ]] || fail "sign-in didn't go to the provider: $authorize"
[[ "$authorize" == *code_challenge_method=S256* ]] || fail "no PKCE in the authorize request"

# The test provider's login form: any subject, any claims.
callback=$(curl -s -o /dev/null -w '%{redirect_url}' -X POST "$authorize" \
  --data-urlencode "username=smoke_user" \
  --data-urlencode 'claims={"name":"Smoke Test","email":"smoke@example.test","email_verified":true}')
[[ "$callback" == $APP/auth/callback* ]] || fail "provider didn't redirect back: $callback"

landing=$(curl -s -c "$JAR" -b "$JAR" -o /dev/null -w '%{redirect_url}' "$callback")
[[ "$landing" == "$APP/teams" ]] || fail "callback didn't land on the return path: $landing"
grep -q envhq_session "$JAR" || fail "no session cookie issued"
echo "✔ signed in through OIDC and landed back on /teams"

me=$(curl -sf -b "$JAR" $APP/api/me) || fail "/api/me failed with the session cookie"
[[ "$me" == *smoke_user* ]] || fail "/api/me doesn't know who this is: $me"

team=$(curl -sf -b "$JAR" -X POST -H 'content-type: application/json' -d '{"name":"Smoke Team"}' $APP/api/orgs) \
  || fail "couldn't create a team"
[[ "$team" == *'"role":"admin"'* ]] || fail "team creator isn't admin: $team"
echo "✔ created a team as its admin"

token=$(curl -sf -b "$JAR" -X POST -H 'content-type: application/json' -d '{"name":"smoke"}' $APP/api/tokens \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token))') \
  || fail "couldn't create an API token"

# Headless, the way CI uses it: no `envhq login`, no keychain — just the
# token and ENVHQ_URL pointing at this instance instead of envhq.dev.
home=$(mktemp -d)
orgs=$(HOME="$home" ENVHQ_TOKEN="$token" ENVHQ_URL=$APP npx -y "envhq@$CLI_VERSION" orgs 2>&1) \
  || fail "envhq orgs failed against the instance: $orgs"
rm -rf "$home"
[[ "$orgs" == *"Smoke Team"* ]] || fail "the CLI doesn't see the team: $orgs"
echo "✔ envhq@$CLI_VERSION, pointed at this instance with ENVHQ_URL, sees the team"

out=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST $APP/auth/sign-out)
[[ "$out" == "303" ]] || fail "sign-out returned $out"
echo "✔ signed out"
echo "All self-hosting checks passed."

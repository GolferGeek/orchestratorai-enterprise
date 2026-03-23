#!/usr/bin/env bash
# test-invoke-endpoints.sh
#
# Smoke-tests all invoke endpoints from the outside using curl.
#
# Requirements:
#   - Auth API running on $AUTH_API_URL  (default http://localhost:6100)
#   - Compose API running on $COMPOSE_API_URL  (default http://localhost:6300)
#   - Forge API running on $FORGE_API_URL      (default http://localhost:6200)
#   - Pulse API running on $PULSE_API_URL      (default http://localhost:6500)
#   - Bridge API running on $BRIDGE_API_URL    (default http://localhost:6600)
#   - Supabase running (REST 54321, Postgres 54322)
#   - jq installed (brew install jq)
#
# Usage:
#   bash scripts/curl-tests/test-invoke-endpoints.sh
#
# Override credentials via env:
#   TEST_EMAIL=... TEST_PASSWORD=... bash scripts/curl-tests/test-invoke-endpoints.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — reads from env first, falls back to dev defaults
# ---------------------------------------------------------------------------
AUTH_API_URL="${AUTH_API_URL:-http://localhost:6100}"
COMPOSE_API_URL="${COMPOSE_API_URL:-http://localhost:6300}"
FORGE_API_URL="${FORGE_API_URL:-http://localhost:6200}"
PULSE_API_URL="${PULSE_API_URL:-http://localhost:6500}"
BRIDGE_API_URL="${BRIDGE_API_URL:-http://localhost:6600}"

TEST_EMAIL="${TEST_EMAIL:-golfergeek@orchestratorai.io}"
TEST_PASSWORD="${TEST_PASSWORD:-GolferGeek123!}"
TEST_ORG_SLUG="${TEST_ORG_SLUG:-marketing}"
TEST_USER_ID="${TEST_USER_ID:-876558c7-d009-4271-90a3-5078aaa8ca46}"

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

log_pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
log_fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

check_jq() {
  if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required but not installed. Install with: brew install jq"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Step 1 — Obtain JWT from Auth API
# ---------------------------------------------------------------------------

get_token() {
  echo ""
  echo "==> Authenticating as ${TEST_EMAIL} via ${AUTH_API_URL}/auth/login ..."

  local response
  response=$(curl -sf -X POST "${AUTH_API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" 2>&1) || {
    echo "ERROR: Auth API request failed. Is the Auth API running at ${AUTH_API_URL}?"
    exit 1
  }

  local token
  token=$(echo "${response}" | jq -r '.accessToken // empty')

  if [[ -z "${token}" ]]; then
    echo "ERROR: Auth login did not return an accessToken."
    echo "Response: ${response}"
    exit 1
  fi

  echo "  Token obtained (${#token} chars)"
  echo "${token}"
}

# ---------------------------------------------------------------------------
# Shared invoke request builder
# ---------------------------------------------------------------------------

build_invoke_body() {
  local id="$1"
  local agent_slug="$2"
  local agent_type="${3:-context}"
  local direction="${4:-}"

  local metadata="{\"source\":\"curl-test\"}"
  if [[ -n "${direction}" ]]; then
    metadata="{\"source\":\"curl-test\",\"direction\":\"${direction}\"}"
  fi

  cat <<EOF
{
  "jsonrpc": "2.0",
  "id": "${id}",
  "method": "invoke",
  "params": {
    "context": {
      "orgSlug": "${TEST_ORG_SLUG}",
      "userId": "${TEST_USER_ID}",
      "conversationId": "00000000-0000-0000-0000-000000000000",
      "agentSlug": "${agent_slug}",
      "agentType": "${agent_type}",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    },
    "data": {
      "content": "Curl smoke test invocation",
      "contentType": "text"
    },
    "metadata": ${metadata}
  }
}
EOF
}

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

assert_jsonrpc_envelope() {
  local label="$1"
  local response="$2"
  local expected_id="$3"

  local jsonrpc id
  jsonrpc=$(echo "${response}" | jq -r '.jsonrpc // empty' 2>/dev/null)
  id=$(echo "${response}" | jq -r '.id // empty' 2>/dev/null)

  if [[ "${jsonrpc}" == "2.0" && "${id}" == "${expected_id}" ]]; then
    log_pass "${label}: valid JSON-RPC 2.0 envelope (id=${id})"
  else
    log_fail "${label}: expected jsonrpc=2.0 id=${expected_id}, got jsonrpc=${jsonrpc} id=${id}"
    echo "    Response: ${response}" | head -c 300
  fi
}

assert_401() {
  local label="$1"
  local http_status="$2"

  if [[ "${http_status}" == "401" ]]; then
    log_pass "${label}: returns 401"
  else
    log_fail "${label}: expected 401, got ${http_status}"
  fi
}

assert_jsonrpc_error() {
  local label="$1"
  local response="$2"

  local has_error
  has_error=$(echo "${response}" | jq 'has("error")' 2>/dev/null)

  if [[ "${has_error}" == "true" ]]; then
    local code msg
    code=$(echo "${response}" | jq '.error.code // "none"' 2>/dev/null)
    msg=$(echo "${response}" | jq -r '.error.message // ""' 2>/dev/null)
    log_pass "${label}: JSON-RPC error (code=${code}, message=\"${msg:0:80}\")"
  else
    log_fail "${label}: expected JSON-RPC error object, got: ${response:0:200}"
  fi
}

# ---------------------------------------------------------------------------
# Section: Compose (port 6300)
# ---------------------------------------------------------------------------

test_compose() {
  local token="$1"
  echo ""
  echo "--- Compose API (${COMPOSE_API_URL}) ---"

  # 1. Valid invoke — envelope check
  local body req_id="curl-compose-1"
  body=$(build_invoke_body "${req_id}" "blog-post-writer" "context")
  local response
  response=$(curl -sf -X POST "${COMPOSE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_envelope "Compose POST /invoke with valid JWT" "${response}" "${req_id}"

  # 2. No JWT — expect 401
  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${COMPOSE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -d "${body}" 2>/dev/null)
  assert_401 "Compose POST /invoke without JWT" "${http_status}"

  # 3. Missing params.context — INVALID_PARAMS
  local missing_ctx_body="{\"jsonrpc\":\"2.0\",\"id\":\"curl-compose-2\",\"method\":\"invoke\",\"params\":{\"data\":{\"content\":\"test\"}}}"
  response=$(curl -sf -X POST "${COMPOSE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${missing_ctx_body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_error "Compose POST /invoke missing params.context returns error" "${response}"

  # 4. Unknown agentSlug — meaningful error
  body=$(build_invoke_body "curl-compose-3" "slug-that-does-not-exist-anywhere" "context")
  response=$(curl -sf -X POST "${COMPOSE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_error "Compose POST /invoke unknown agentSlug returns error" "${response}"
}

# ---------------------------------------------------------------------------
# Section: Forge (port 6200)
# ---------------------------------------------------------------------------

test_forge() {
  local token="$1"
  echo ""
  echo "--- Forge API (${FORGE_API_URL}) ---"

  # 1. Valid invoke — envelope check
  local body req_id="curl-forge-1"
  body=$(build_invoke_body "${req_id}" "marketing-swarm" "capability")
  local response
  response=$(curl -sf -X POST "${FORGE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_envelope "Forge POST /invoke with valid JWT" "${response}" "${req_id}"

  # 2. Unknown capability — error
  body=$(build_invoke_body "curl-forge-2" "capability-slug-not-registered" "capability")
  response=$(curl -sf -X POST "${FORGE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_error "Forge POST /invoke unknown capability returns error" "${response}"

  # 3. GET /.well-known/capabilities — discoverable cards
  response=$(curl -sf "${FORGE_API_URL}/.well-known/capabilities" 2>/dev/null || echo '{}')
  local product
  product=$(echo "${response}" | jq -r '.product // empty' 2>/dev/null)
  if [[ "${product}" == "forge" ]]; then
    local count
    count=$(echo "${response}" | jq '.capabilities | length' 2>/dev/null)
    log_pass "Forge GET /.well-known/capabilities: product=forge, ${count} capabilities"
  else
    log_fail "Forge GET /.well-known/capabilities: expected product=forge, got: ${response:0:200}"
  fi

  # 4. No JWT — expect 401
  body=$(build_invoke_body "curl-forge-3" "marketing-swarm" "capability")
  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${FORGE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -d "${body}" 2>/dev/null)
  assert_401 "Forge POST /invoke without JWT" "${http_status}"
}

# ---------------------------------------------------------------------------
# Section: Pulse (port 6500)
# ---------------------------------------------------------------------------

test_pulse() {
  local token="$1"
  echo ""
  echo "--- Pulse API (${PULSE_API_URL}) ---"

  # 1. Valid invoke — envelope check
  local body req_id="curl-pulse-1"
  body=$(build_invoke_body "${req_id}" "predictor" "workflow")
  local response
  response=$(curl -sf -X POST "${PULSE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_envelope "Pulse POST /invoke with valid JWT" "${response}" "${req_id}"

  # 2. Unregistered handler — error
  body=$(build_invoke_body "curl-pulse-2" "handler-slug-not-registered-in-pulse" "workflow")
  response=$(curl -sf -X POST "${PULSE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_error "Pulse POST /invoke unregistered handler returns error" "${response}"

  # 3. No JWT — expect 401
  body=$(build_invoke_body "curl-pulse-3" "predictor" "workflow")
  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${PULSE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -d "${body}" 2>/dev/null)
  assert_401 "Pulse POST /invoke without JWT" "${http_status}"
}

# ---------------------------------------------------------------------------
# Section: Bridge (port 6600)
# ---------------------------------------------------------------------------

test_bridge() {
  local token="$1"
  echo ""
  echo "--- Bridge API (${BRIDGE_API_URL}) ---"

  # 1. Valid invoke (inbound) — envelope check
  local body req_id="curl-bridge-1"
  body=$(build_invoke_body "${req_id}" "bridge-agent" "workflow" "inbound")
  local response
  response=$(curl -sf -X POST "${BRIDGE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_envelope "Bridge POST /invoke inbound with valid JWT" "${response}" "${req_id}"

  # 2. Missing direction — defaults to inbound
  local no_dir_body
  no_dir_body=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": "curl-bridge-2",
  "method": "invoke",
  "params": {
    "context": {
      "orgSlug": "${TEST_ORG_SLUG}",
      "userId": "${TEST_USER_ID}",
      "conversationId": "00000000-0000-0000-0000-000000000000",
      "agentSlug": "bridge-agent",
      "agentType": "workflow",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    },
    "data": { "content": "no direction field test", "contentType": "text" },
    "metadata": { "source": "curl-test" }
  }
}
EOF
)
  response=$(curl -sf -X POST "${BRIDGE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${no_dir_body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_envelope "Bridge POST /invoke missing direction defaults to inbound" "${response}" "curl-bridge-2"

  # 3. Outbound without targetAgentId — error
  local outbound_no_target_body
  outbound_no_target_body=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": "curl-bridge-3",
  "method": "invoke",
  "params": {
    "context": {
      "orgSlug": "${TEST_ORG_SLUG}",
      "userId": "${TEST_USER_ID}",
      "conversationId": "00000000-0000-0000-0000-000000000000",
      "agentSlug": "bridge-agent",
      "agentType": "workflow",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    },
    "data": { "content": "outbound no target test", "contentType": "text" },
    "metadata": { "direction": "outbound", "source": "curl-test" }
  }
}
EOF
)
  response=$(curl -sf -X POST "${BRIDGE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -H "x-organization-slug: ${TEST_ORG_SLUG}" \
    -d "${outbound_no_target_body}" 2>/dev/null || echo '{}')
  assert_jsonrpc_error "Bridge POST /invoke outbound without targetAgentId returns error" "${response}"

  # 4. No JWT — expect 401
  body=$(build_invoke_body "curl-bridge-4" "bridge-agent" "workflow" "inbound")
  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BRIDGE_API_URL}/invoke" \
    -H "Content-Type: application/json" \
    -d "${body}" 2>/dev/null)
  assert_401 "Bridge POST /invoke without JWT" "${http_status}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  echo "======================================================"
  echo " OrchestratorAI — Invoke Endpoint Curl Smoke Tests"
  echo "======================================================"
  echo ""
  echo "Auth:    ${AUTH_API_URL}"
  echo "Compose: ${COMPOSE_API_URL}"
  echo "Forge:   ${FORGE_API_URL}"
  echo "Pulse:   ${PULSE_API_URL}"
  echo "Bridge:  ${BRIDGE_API_URL}"

  check_jq

  local token
  token=$(get_token)

  test_compose "${token}"
  test_forge "${token}"
  test_pulse "${token}"
  test_bridge "${token}"

  echo ""
  echo "======================================================"
  echo " Results: ${PASS} passed, ${FAIL} failed"
  echo "======================================================"

  if [[ ${FAIL} -gt 0 ]]; then
    exit 1
  fi
}

main "$@"

#!/bin/bash
# =============================================================================
# Stock Predictor E2E Tests via cURL
# =============================================================================
#
# Manual test script for Stock Predictor Runner endpoints.
# Tests the prediction controller REST API.
#
# Prerequisites:
# - Supabase running (npm run dev:supabase)
# - API service running (npm run dev:api)
# - Environment variables set
# - Stock prediction agent exists in database
#
# Usage:
#   ./test-stock-predictor-curl.sh [agent-id]
#
# Examples:
#   ./test-stock-predictor-curl.sh                           # Uses seed agent
#   ./test-stock-predictor-curl.sh abc123-uuid               # Specific agent
#
# =============================================================================

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source helpers
source "$SCRIPT_DIR/common/auth-helper.sh"
source "$SCRIPT_DIR/common/assert-helper.sh"

# Load environment
load_env
validate_env

# Configuration
SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:6010}"
API_URL="${API_URL:-http://127.0.0.1:6100}"
TEST_EMAIL="${SUPABASE_TEST_USER:-golfergeek@orchestratorai.io}"
TEST_PASSWORD="${SUPABASE_TEST_PASSWORD:-GolferGeek123!}"

# Agent selection (will find from DB if not provided)
AGENT_ID="${1:-}"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE} Stock Predictor cURL E2E Tests${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  SUPABASE_URL: $SUPABASE_URL"
echo "  API_URL: $API_URL"
echo ""

# =============================================================================
# Test 0: Authenticate
# =============================================================================

log_test "0. Authenticate with Supabase"

if authenticate "$TEST_EMAIL" "$TEST_PASSWORD"; then
  log_success "Authenticated successfully"
  log_info "User ID: $USER_ID"
else
  exit 1
fi

# =============================================================================
# Test 1: Find Stock Prediction Agent
# =============================================================================

log_test "1. Find Stock Prediction Agent"

if [ -z "$AGENT_ID" ]; then
  # Find a stock predictor agent from the database
  AGENTS_RESPONSE=$(curl -s "$SUPABASE_URL/rest/v1/agents?metadata->>runner=eq.stock-predictor&select=id,slug,org_slug,metadata&limit=1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

  AGENT_COUNT=$(echo "$AGENTS_RESPONSE" | jq 'length')

  if [ "$AGENT_COUNT" -gt 0 ]; then
    AGENT_ID=$(echo "$AGENTS_RESPONSE" | jq -r '.[0].id')
    AGENT_SLUG=$(echo "$AGENTS_RESPONSE" | jq -r '.[0].slug')
    ORG_SLUG=$(echo "$AGENTS_RESPONSE" | jq -r '.[0].org_slug')
    log_success "Found stock predictor agent: $AGENT_SLUG"
    log_info "Agent ID: $AGENT_ID"
    log_info "Org: $ORG_SLUG"
  else
    log_fail "No stock predictor agent found in database"
    log_info "Run the seed SQL to create test agents:"
    log_info "  psql -f apps/api/supabase/seed/prediction-agents.sql"
    exit 1
  fi
else
  # Verify the provided agent exists
  AGENT_RESPONSE=$(curl -s "$SUPABASE_URL/rest/v1/agents?id=eq.$AGENT_ID&select=id,slug,org_slug,metadata" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

  AGENT_COUNT=$(echo "$AGENT_RESPONSE" | jq 'length')

  if [ "$AGENT_COUNT" -gt 0 ]; then
    AGENT_SLUG=$(echo "$AGENT_RESPONSE" | jq -r '.[0].slug')
    ORG_SLUG=$(echo "$AGENT_RESPONSE" | jq -r '.[0].org_slug')
    log_success "Found agent: $AGENT_SLUG"
  else
    log_fail "Agent not found: $AGENT_ID"
    exit 1
  fi
fi

# =============================================================================
# Test 2: Get Current Predictions
# =============================================================================

log_test "2. Get Current Predictions"

CURRENT_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$AGENT_ID/current" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$CURRENT_RESPONSE" | tail -n1)
CURRENT_BODY=$(echo "$CURRENT_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/current returned 200"

  # Verify response structure
  RESPONSE_AGENT_ID=$(echo "$CURRENT_BODY" | jq -r '.agentId // empty')
  RESPONSE_SLUG=$(echo "$CURRENT_BODY" | jq -r '.agentSlug // empty')
  RECOMMENDATIONS=$(echo "$CURRENT_BODY" | jq -r '.recommendations // []')
  REC_COUNT=$(echo "$RECOMMENDATIONS" | jq 'length')

  assert_not_empty "$RESPONSE_AGENT_ID" "agentId"
  assert_not_empty "$RESPONSE_SLUG" "agentSlug"
  log_info "Recommendations: $REC_COUNT"
else
  log_fail "GET /predictions/:agentId/current returned $HTTP_STATUS"
  echo "$CURRENT_BODY" | jq .
fi

# =============================================================================
# Test 3: Get Prediction History
# =============================================================================

log_test "3. Get Prediction History"

HISTORY_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$AGENT_ID/history?page=1&pageSize=10" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$HISTORY_RESPONSE" | tail -n1)
HISTORY_BODY=$(echo "$HISTORY_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/history returned 200"

  TOTAL=$(echo "$HISTORY_BODY" | jq -r '.total // 0')
  PAGE=$(echo "$HISTORY_BODY" | jq -r '.page // 1')
  log_info "Total recommendations: $TOTAL, Page: $PAGE"
else
  log_fail "GET /predictions/:agentId/history returned $HTTP_STATUS"
  echo "$HISTORY_BODY" | jq .
fi

# =============================================================================
# Test 4: Get Instruments
# =============================================================================

log_test "4. Get Instruments"

INSTRUMENTS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$AGENT_ID/instruments" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$INSTRUMENTS_RESPONSE" | tail -n1)
INSTRUMENTS_BODY=$(echo "$INSTRUMENTS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/instruments returned 200"

  INSTRUMENTS=$(echo "$INSTRUMENTS_BODY" | jq -r '.instruments // []')
  INSTRUMENT_COUNT=$(echo "$INSTRUMENTS" | jq 'length')
  log_info "Instruments: $INSTRUMENT_COUNT"
  echo "$INSTRUMENTS" | jq -c '.'
else
  log_fail "GET /predictions/:agentId/instruments returned $HTTP_STATUS"
  echo "$INSTRUMENTS_BODY" | jq .
fi

# =============================================================================
# Test 5: Get Tools Status
# =============================================================================

log_test "5. Get Tools Status"

TOOLS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$AGENT_ID/tools" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$TOOLS_RESPONSE" | tail -n1)
TOOLS_BODY=$(echo "$TOOLS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/tools returned 200"

  TOOLS=$(echo "$TOOLS_BODY" | jq -r '.tools // []')
  TOOL_COUNT=$(echo "$TOOLS" | jq 'length')
  log_info "Tools: $TOOL_COUNT"
  echo "$TOOLS" | jq -c '.[] | {name, status, recentClaims}'
else
  log_fail "GET /predictions/:agentId/tools returned $HTTP_STATUS"
  echo "$TOOLS_BODY" | jq .
fi

# =============================================================================
# Test 6: Get Config
# =============================================================================

log_test "6. Get Config"

CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$AGENT_ID/config" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$CONFIG_RESPONSE" | tail -n1)
CONFIG_BODY=$(echo "$CONFIG_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/config returned 200"

  RUNNER=$(echo "$CONFIG_BODY" | jq -r '.config.runner // empty')
  RISK_PROFILE=$(echo "$CONFIG_BODY" | jq -r '.config.riskProfile // empty')
  log_info "Runner: $RUNNER"
  log_info "Risk Profile: $RISK_PROFILE"
else
  log_fail "GET /predictions/:agentId/config returned $HTTP_STATUS"
  echo "$CONFIG_BODY" | jq .
fi

# =============================================================================
# Test 7: Get Status
# =============================================================================

log_test "7. Get Status"

STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$AGENT_ID/status" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$STATUS_RESPONSE" | tail -n1)
STATUS_BODY=$(echo "$STATUS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/status returned 200"

  AGENT_STATUS=$(echo "$STATUS_BODY" | jq -r '.status // empty')
  IS_RUNNING=$(echo "$STATUS_BODY" | jq -r '.isRunning // false')
  log_info "Status: $AGENT_STATUS"
  log_info "Running: $IS_RUNNING"
else
  log_fail "GET /predictions/:agentId/status returned $HTTP_STATUS"
  echo "$STATUS_BODY" | jq .
fi

# =============================================================================
# Test 8: Start/Stop Lifecycle (Optional - Requires Running Orchestrator)
# =============================================================================

log_test "8. Agent Lifecycle (Start/Stop)"

# Only test lifecycle if orchestrator is running
ORCHESTRATOR_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")

if [ "$ORCHESTRATOR_CHECK" = "200" ]; then
  # Test Start
  START_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/predictions/$AGENT_ID/start" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json")

  HTTP_STATUS=$(echo "$START_RESPONSE" | tail -n1)
  START_BODY=$(echo "$START_RESPONSE" | sed '$d')

  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
    log_success "POST /predictions/:agentId/start returned $HTTP_STATUS"
    NEW_STATUS=$(echo "$START_BODY" | jq -r '.status // empty')
    log_info "New status: $NEW_STATUS"
  else
    log_info "POST /predictions/:agentId/start returned $HTTP_STATUS (may already be running)"
  fi

  # Test Stop
  STOP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/predictions/$AGENT_ID/stop" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json")

  HTTP_STATUS=$(echo "$STOP_RESPONSE" | tail -n1)
  STOP_BODY=$(echo "$STOP_RESPONSE" | sed '$d')

  if [ "$HTTP_STATUS" = "200" ]; then
    log_success "POST /predictions/:agentId/stop returned 200"
    NEW_STATUS=$(echo "$STOP_BODY" | jq -r '.status // empty')
    log_info "New status: $NEW_STATUS"
  else
    log_info "POST /predictions/:agentId/stop returned $HTTP_STATUS (may already be stopped)"
  fi
else
  log_skip "Orchestrator not running, skipping lifecycle tests"
fi

# =============================================================================
# Summary
# =============================================================================

print_summary

echo ""
echo "Agent tested: $AGENT_SLUG ($AGENT_ID)"
echo ""

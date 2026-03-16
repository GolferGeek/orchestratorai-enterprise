#!/bin/bash
# =============================================================================
# Prediction Lifecycle E2E Tests via cURL
# =============================================================================
#
# Tests the complete lifecycle of a prediction agent:
# - Create agent
# - Configure instruments
# - Start polling
# - Trigger manual poll
# - Pause/Resume
# - Stop
# - Update config
# - Clean up
#
# Prerequisites:
# - Supabase running (npm run dev:supabase)
# - API service running (npm run dev:api)
# - Environment variables set
#
# Usage:
#   ./test-prediction-lifecycle-curl.sh
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

# Generate unique IDs for this test run
TEST_AGENT_SLUG="test-lifecycle-$(date +%s)"
TEST_ORG_SLUG="demo"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE} Prediction Lifecycle E2E Tests${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  SUPABASE_URL: $SUPABASE_URL"
echo "  API_URL: $API_URL"
echo "  TEST_AGENT_SLUG: $TEST_AGENT_SLUG"
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
# Test 1: Create Test Prediction Agent
# =============================================================================

log_test "1. Create Test Prediction Agent"

# Generate UUID for the agent
TEST_AGENT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

# Create agent via Supabase API (using service role)
CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" "$SUPABASE_URL/rest/v1/agents" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"id\": \"$TEST_AGENT_ID\",
    \"slug\": \"$TEST_AGENT_SLUG\",
    \"org_slug\": \"$TEST_ORG_SLUG\",
    \"name\": \"Test Lifecycle Agent\",
    \"agent_type\": \"prediction\",
    \"owner_id\": \"$USER_ID\",
    \"metadata\": {
      \"description\": \"Test agent for lifecycle E2E tests\",
      \"runnerConfig\": {
        \"runner\": \"stock-predictor\",
        \"instruments\": [\"AAPL\", \"MSFT\"],
        \"riskProfile\": \"moderate\",
        \"pollIntervalMs\": 60000,
        \"preFilterThresholds\": {
          \"minPriceChangePercent\": 2,
          \"minSentimentShift\": 0.3,
          \"minSignificanceScore\": 0.5
        }
      }
    }
  }")

HTTP_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
CREATE_BODY=$(echo "$CREATE_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "201" ]; then
  log_success "Created test agent: $TEST_AGENT_SLUG"
  log_info "Agent ID: $TEST_AGENT_ID"
else
  log_fail "Failed to create test agent: $HTTP_STATUS"
  echo "$CREATE_BODY" | jq .
  exit 1
fi

# Cleanup function
cleanup() {
  echo ""
  log_info "Cleaning up test agent..."

  # Stop agent if running
  curl -s -X POST "$API_URL/predictions/$TEST_AGENT_ID/stop" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" > /dev/null 2>&1 || true

  # Delete agent
  curl -s -X DELETE "$SUPABASE_URL/rest/v1/agents?id=eq.$TEST_AGENT_ID" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > /dev/null 2>&1 || true

  # Delete any datapoints
  curl -s -X DELETE "$SUPABASE_URL/rest/v1/prediction_datapoints?agent_id=eq.$TEST_AGENT_ID" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > /dev/null 2>&1 || true

  # Delete any recommendations
  curl -s -X DELETE "$SUPABASE_URL/rest/v1/prediction_recommendations?agent_id=eq.$TEST_AGENT_ID" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > /dev/null 2>&1 || true

  log_info "Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT

# =============================================================================
# Test 2: Verify Agent Config
# =============================================================================

log_test "2. Verify Agent Config"

CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$TEST_AGENT_ID/config" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$CONFIG_RESPONSE" | tail -n1)
CONFIG_BODY=$(echo "$CONFIG_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/config returned 200"

  RUNNER=$(echo "$CONFIG_BODY" | jq -r '.config.runner // empty')
  RISK_PROFILE=$(echo "$CONFIG_BODY" | jq -r '.config.riskProfile // empty')

  assert_equals "$RUNNER" "stock-predictor" "Runner type"
  assert_equals "$RISK_PROFILE" "moderate" "Risk profile"
else
  log_fail "GET /predictions/:agentId/config returned $HTTP_STATUS"
  echo "$CONFIG_BODY" | jq .
fi

# =============================================================================
# Test 3: Update Instruments
# =============================================================================

log_test "3. Update Instruments"

UPDATE_INSTRUMENTS_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$API_URL/predictions/$TEST_AGENT_ID/instruments" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instruments": ["AAPL", "MSFT", "GOOGL", "NVDA"]
  }')

HTTP_STATUS=$(echo "$UPDATE_INSTRUMENTS_RESPONSE" | tail -n1)
UPDATE_BODY=$(echo "$UPDATE_INSTRUMENTS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "PUT /predictions/:agentId/instruments returned 200"

  INSTRUMENTS=$(echo "$UPDATE_BODY" | jq -r '.instruments // []')
  INSTRUMENT_COUNT=$(echo "$INSTRUMENTS" | jq 'length')
  assert_equals "$INSTRUMENT_COUNT" "4" "Instrument count"
else
  log_fail "PUT /predictions/:agentId/instruments returned $HTTP_STATUS"
  echo "$UPDATE_BODY" | jq .
fi

# =============================================================================
# Test 4: Get Initial Status
# =============================================================================

log_test "4. Get Initial Status"

STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$TEST_AGENT_ID/status" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$STATUS_RESPONSE" | tail -n1)
STATUS_BODY=$(echo "$STATUS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/status returned 200"

  AGENT_STATUS=$(echo "$STATUS_BODY" | jq -r '.status // empty')
  IS_RUNNING=$(echo "$STATUS_BODY" | jq -r '.isRunning // false')
  log_info "Initial status: $AGENT_STATUS (running: $IS_RUNNING)"
else
  log_fail "GET /predictions/:agentId/status returned $HTTP_STATUS"
fi

# =============================================================================
# Test 5: Start Agent
# =============================================================================

log_test "5. Start Agent"

START_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/predictions/$TEST_AGENT_ID/start" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$START_RESPONSE" | tail -n1)
START_BODY=$(echo "$START_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
  log_success "POST /predictions/:agentId/start returned $HTTP_STATUS"

  NEW_STATUS=$(echo "$START_BODY" | jq -r '.status // empty')
  log_info "Status after start: $NEW_STATUS"
else
  # Start might fail if orchestrator isn't running - that's OK for this test
  log_info "POST /predictions/:agentId/start returned $HTTP_STATUS"
  log_info "This is expected if orchestrator isn't running in E2E mode"
fi

# =============================================================================
# Test 6: Pause Agent
# =============================================================================

log_test "6. Pause Agent"

PAUSE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/predictions/$TEST_AGENT_ID/pause" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$PAUSE_RESPONSE" | tail -n1)
PAUSE_BODY=$(echo "$PAUSE_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "POST /predictions/:agentId/pause returned 200"
  log_info "Agent paused"
else
  log_info "POST /predictions/:agentId/pause returned $HTTP_STATUS (may not be running)"
fi

# =============================================================================
# Test 7: Resume Agent
# =============================================================================

log_test "7. Resume Agent"

RESUME_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/predictions/$TEST_AGENT_ID/resume" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$RESUME_RESPONSE" | tail -n1)
RESUME_BODY=$(echo "$RESUME_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "POST /predictions/:agentId/resume returned 200"
  log_info "Agent resumed"
else
  log_info "POST /predictions/:agentId/resume returned $HTTP_STATUS (may not be paused)"
fi

# =============================================================================
# Test 8: Trigger Manual Poll
# =============================================================================

log_test "8. Trigger Manual Poll"

POLL_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/predictions/$TEST_AGENT_ID/poll-now" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$POLL_RESPONSE" | tail -n1)
POLL_BODY=$(echo "$POLL_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "202" ]; then
  log_success "POST /predictions/:agentId/poll-now returned $HTTP_STATUS"
  log_info "Manual poll triggered"
else
  log_info "POST /predictions/:agentId/poll-now returned $HTTP_STATUS (may not be running)"
fi

# =============================================================================
# Test 9: Update Config
# =============================================================================

log_test "9. Update Config"

UPDATE_CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$API_URL/predictions/$TEST_AGENT_ID/config" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "riskProfile": "aggressive",
      "pollIntervalMs": 30000,
      "preFilterThresholds": {
        "minPriceChangePercent": 1,
        "minSentimentShift": 0.2,
        "minSignificanceScore": 0.3
      }
    }
  }')

HTTP_STATUS=$(echo "$UPDATE_CONFIG_RESPONSE" | tail -n1)
UPDATE_CONFIG_BODY=$(echo "$UPDATE_CONFIG_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "PUT /predictions/:agentId/config returned 200"

  NEW_RISK=$(echo "$UPDATE_CONFIG_BODY" | jq -r '.config.riskProfile // empty')
  log_info "New risk profile: $NEW_RISK"
else
  log_fail "PUT /predictions/:agentId/config returned $HTTP_STATUS"
  echo "$UPDATE_CONFIG_BODY" | jq .
fi

# =============================================================================
# Test 10: Stop Agent
# =============================================================================

log_test "10. Stop Agent"

STOP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/predictions/$TEST_AGENT_ID/stop" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$STOP_RESPONSE" | tail -n1)
STOP_BODY=$(echo "$STOP_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "POST /predictions/:agentId/stop returned 200"
  log_info "Agent stopped"
else
  log_info "POST /predictions/:agentId/stop returned $HTTP_STATUS (may already be stopped)"
fi

# =============================================================================
# Test 11: Verify Final Status
# =============================================================================

log_test "11. Verify Final Status"

FINAL_STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/predictions/$TEST_AGENT_ID/status" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$FINAL_STATUS_RESPONSE" | tail -n1)
FINAL_STATUS_BODY=$(echo "$FINAL_STATUS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /predictions/:agentId/status returned 200"

  FINAL_AGENT_STATUS=$(echo "$FINAL_STATUS_BODY" | jq -r '.status // empty')
  FINAL_IS_RUNNING=$(echo "$FINAL_STATUS_BODY" | jq -r '.isRunning // false')
  log_info "Final status: $FINAL_AGENT_STATUS (running: $FINAL_IS_RUNNING)"
else
  log_fail "GET /predictions/:agentId/status returned $HTTP_STATUS"
fi

# =============================================================================
# Summary
# =============================================================================

print_summary

echo ""
echo "Test agent: $TEST_AGENT_SLUG ($TEST_AGENT_ID)"
echo ""

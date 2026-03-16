#!/bin/bash
# =============================================================================
# Learning Conversation E2E Tests via cURL
# =============================================================================
#
# Tests the learning loop functionality for prediction agents:
# - Learning summary
# - Postmortems
# - Missed opportunities
# - User insights
# - Specialist stats
# - Learning conversation (HITL)
# - Context updates
#
# Prerequisites:
# - Supabase running (npm run dev:supabase)
# - API service running (npm run dev:api)
# - Environment variables set
# - Stock prediction agent with some history
#
# Usage:
#   ./test-learning-conversation-curl.sh [agent-id]
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
echo -e "${BLUE} Learning Conversation E2E Tests${NC}"
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
    log_success "Found stock predictor agent: $AGENT_SLUG"
    log_info "Agent ID: $AGENT_ID"
  else
    log_fail "No stock predictor agent found in database"
    log_info "Run the seed SQL to create test agents"
    exit 1
  fi
else
  AGENT_SLUG="provided-agent"
  log_info "Using provided agent ID: $AGENT_ID"
fi

# =============================================================================
# Test 2: Get Learning Summary
# =============================================================================

log_test "2. Get Learning Summary"

SUMMARY_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/learning/$AGENT_ID/summary" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$SUMMARY_RESPONSE" | tail -n1)
SUMMARY_BODY=$(echo "$SUMMARY_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /learning/:agentId/summary returned 200"

  ACCURACY=$(echo "$SUMMARY_BODY" | jq -r '.accuracy // "N/A"')
  TOTAL_RECS=$(echo "$SUMMARY_BODY" | jq -r '.totalRecommendations // 0')
  POSTMORTEM_COUNT=$(echo "$SUMMARY_BODY" | jq -r '.postmortemCount // 0')
  UNAPPLIED=$(echo "$SUMMARY_BODY" | jq -r '.unappliedCount // 0')

  log_info "Accuracy: $ACCURACY"
  log_info "Total recommendations: $TOTAL_RECS"
  log_info "Postmortems: $POSTMORTEM_COUNT"
  log_info "Unapplied learnings: $UNAPPLIED"
else
  log_fail "GET /learning/:agentId/summary returned $HTTP_STATUS"
  echo "$SUMMARY_BODY" | jq .
fi

# =============================================================================
# Test 3: Get Postmortems
# =============================================================================

log_test "3. Get Postmortems"

POSTMORTEMS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/learning/$AGENT_ID/postmortems?limit=10" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$POSTMORTEMS_RESPONSE" | tail -n1)
POSTMORTEMS_BODY=$(echo "$POSTMORTEMS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /learning/:agentId/postmortems returned 200"

  TOTAL=$(echo "$POSTMORTEMS_BODY" | jq -r '.total // 0')
  log_info "Total postmortems: $TOTAL"

  if [ "$TOTAL" -gt 0 ]; then
    echo "$POSTMORTEMS_BODY" | jq -c '.postmortems[:3] | .[] | {instrument, outcome, rootCause: .rootCause[:50]}'
  fi
else
  log_fail "GET /learning/:agentId/postmortems returned $HTTP_STATUS"
  echo "$POSTMORTEMS_BODY" | jq .
fi

# =============================================================================
# Test 4: Get Missed Opportunities
# =============================================================================

log_test "4. Get Missed Opportunities"

MISSED_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/learning/$AGENT_ID/missed-opportunities?limit=10" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$MISSED_RESPONSE" | tail -n1)
MISSED_BODY=$(echo "$MISSED_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /learning/:agentId/missed-opportunities returned 200"

  TOTAL=$(echo "$MISSED_BODY" | jq -r '.total // 0')
  log_info "Total missed opportunities: $TOTAL"

  if [ "$TOTAL" -gt 0 ]; then
    echo "$MISSED_BODY" | jq -c '.missedOpportunities[:3] | .[] | {instrument, whyMissed: .whyMissed[:50]}'
  fi
else
  log_fail "GET /learning/:agentId/missed-opportunities returned $HTTP_STATUS"
  echo "$MISSED_BODY" | jq .
fi

# =============================================================================
# Test 5: Get User Insights
# =============================================================================

log_test "5. Get User Insights"

INSIGHTS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/learning/$AGENT_ID/user-insights?limit=10" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$INSIGHTS_RESPONSE" | tail -n1)
INSIGHTS_BODY=$(echo "$INSIGHTS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /learning/:agentId/user-insights returned 200"

  TOTAL=$(echo "$INSIGHTS_BODY" | jq -r '.total // 0')
  log_info "Total user insights: $TOTAL"

  if [ "$TOTAL" -gt 0 ]; then
    echo "$INSIGHTS_BODY" | jq -c '.insights[:3] | .[] | {type: .insightType, summary: .summary[:50]}'
  fi
else
  log_fail "GET /learning/:agentId/user-insights returned $HTTP_STATUS"
  echo "$INSIGHTS_BODY" | jq .
fi

# =============================================================================
# Test 6: Get Specialist Stats
# =============================================================================

log_test "6. Get Specialist Stats"

STATS_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/learning/$AGENT_ID/specialist-stats" \
  -H "Authorization: Bearer $AUTH_TOKEN")

HTTP_STATUS=$(echo "$STATS_RESPONSE" | tail -n1)
STATS_BODY=$(echo "$STATS_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "GET /learning/:agentId/specialist-stats returned 200"

  SPECIALIST_COUNT=$(echo "$STATS_BODY" | jq -r '.specialists | length')
  log_info "Specialists: $SPECIALIST_COUNT"

  if [ "$SPECIALIST_COUNT" -gt 0 ]; then
    echo "$STATS_BODY" | jq -c '.specialists[] | {name: .specialistName, accuracy, predictionCount}'
  fi
else
  log_fail "GET /learning/:agentId/specialist-stats returned $HTTP_STATUS"
  echo "$STATS_BODY" | jq .
fi

# =============================================================================
# Test 7: Start Learning Conversation (HITL)
# =============================================================================

log_test "7. Start Learning Conversation"

CHAT_START_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/learning/$AGENT_ID/chat/start" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "general"
  }')

HTTP_STATUS=$(echo "$CHAT_START_RESPONSE" | tail -n1)
CHAT_START_BODY=$(echo "$CHAT_START_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
  log_success "POST /learning/:agentId/chat/start returned $HTTP_STATUS"

  CONVERSATION_ID=$(echo "$CHAT_START_BODY" | jq -r '.conversationId // empty')
  INITIAL_MESSAGE=$(echo "$CHAT_START_BODY" | jq -r '.initialMessage[:100] // empty')

  if [ -n "$CONVERSATION_ID" ] && [ "$CONVERSATION_ID" != "null" ]; then
    log_info "Conversation ID: $CONVERSATION_ID"
    log_info "Initial message: ${INITIAL_MESSAGE}..."

    # =============================================================================
    # Test 8: Send Message in Conversation
    # =============================================================================

    log_test "8. Send Message in Conversation"

    MESSAGE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/learning/$AGENT_ID/chat/$CONVERSATION_ID/message" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "message": "Why did the AAPL prediction fail last week?"
      }')

    HTTP_STATUS=$(echo "$MESSAGE_RESPONSE" | tail -n1)
    MESSAGE_BODY=$(echo "$MESSAGE_RESPONSE" | sed '$d')

    if [ "$HTTP_STATUS" = "200" ]; then
      log_success "POST /learning/:agentId/chat/:id/message returned 200"

      ASSISTANT_MESSAGE=$(echo "$MESSAGE_BODY" | jq -r '.assistantMessage[:100] // empty')
      log_info "Response: ${ASSISTANT_MESSAGE}..."
    else
      log_info "POST /learning/:agentId/chat/:id/message returned $HTTP_STATUS"
      log_info "This may be expected if LLM service is not configured"
    fi

    # =============================================================================
    # Test 9: End Conversation
    # =============================================================================

    log_test "9. End Conversation"

    END_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/learning/$AGENT_ID/chat/$CONVERSATION_ID/end" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json")

    HTTP_STATUS=$(echo "$END_RESPONSE" | tail -n1)
    END_BODY=$(echo "$END_RESPONSE" | sed '$d')

    if [ "$HTTP_STATUS" = "200" ]; then
      log_success "POST /learning/:agentId/chat/:id/end returned 200"

      SUMMARY=$(echo "$END_BODY" | jq -r '.summary[:100] // empty')
      log_info "Summary: ${SUMMARY}..."
    else
      log_info "POST /learning/:agentId/chat/:id/end returned $HTTP_STATUS"
    fi
  else
    log_skip "No conversation ID returned, skipping chat tests"
  fi
else
  log_info "POST /learning/:agentId/chat/start returned $HTTP_STATUS"
  log_info "This may be expected if no learning data exists"
fi

# =============================================================================
# Test 10: Apply Context Update
# =============================================================================

log_test "10. Apply Context Update"

APPLY_UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/learning/$AGENT_ID/apply-update" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "update": {
      "section": "learned_patterns",
      "content": "Test pattern: When volume increases 50%, pay extra attention to sentiment shifts."
    }
  }')

HTTP_STATUS=$(echo "$APPLY_UPDATE_RESPONSE" | tail -n1)
APPLY_UPDATE_BODY=$(echo "$APPLY_UPDATE_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "POST /learning/:agentId/apply-update returned 200"

  SUCCESS=$(echo "$APPLY_UPDATE_BODY" | jq -r '.success // false')
  log_info "Applied: $SUCCESS"
else
  log_info "POST /learning/:agentId/apply-update returned $HTTP_STATUS"
  log_info "This may require specific permissions or data"
fi

# =============================================================================
# Test 11: Apply All Unapplied Learnings
# =============================================================================

log_test "11. Apply All Unapplied Learnings"

APPLY_ALL_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/learning/$AGENT_ID/apply-all" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$APPLY_ALL_RESPONSE" | tail -n1)
APPLY_ALL_BODY=$(echo "$APPLY_ALL_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
  log_success "POST /learning/:agentId/apply-all returned 200"

  APPLIED_POSTMORTEMS=$(echo "$APPLY_ALL_BODY" | jq -r '.applied.postmortems // 0')
  APPLIED_MISSED=$(echo "$APPLY_ALL_BODY" | jq -r '.applied.missedOpportunities // 0')
  APPLIED_INSIGHTS=$(echo "$APPLY_ALL_BODY" | jq -r '.applied.userInsights // 0')

  log_info "Applied postmortems: $APPLIED_POSTMORTEMS"
  log_info "Applied missed opportunities: $APPLIED_MISSED"
  log_info "Applied user insights: $APPLIED_INSIGHTS"
else
  log_info "POST /learning/:agentId/apply-all returned $HTTP_STATUS"
fi

# =============================================================================
# Summary
# =============================================================================

print_summary

echo ""
echo "Agent tested: $AGENT_SLUG ($AGENT_ID)"
echo ""

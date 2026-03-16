#!/bin/bash

# Create test dimensions for the Investment Risk scope
# Uses the test scope ID from the test results

API_URL="${API_URL:-http://localhost:6100}"
ORG_SLUG="finance"
AGENT_SLUG="investment-risk-agent"
SCOPE_ID="b454c2f7-a071-4ea3-acf8-1439b6b2b6c0"  # Updated Test Scope

# Load auth token if available
if [ -f /tmp/risk_test_auth.env ]; then
  source /tmp/risk_test_auth.env
fi

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Creating test dimensions for Investment Risk Analysis"
echo "API: $API_URL"
echo "Scope ID: $SCOPE_ID"
echo ""

# Function to generate a UUID
generate_uuid() {
  uuidgen | tr '[:upper:]' '[:lower:]'
}

# Function to create a dimension
create_dimension() {
  local slug="$1"
  local name="$2"
  local description="$3"
  local weight="$4"
  local order="$5"
  local task_id=$(generate_uuid)
  local plan_id=$(generate_uuid)
  local del_id=$(generate_uuid)
  local conv_id=$(generate_uuid)

  echo -n "Creating dimension '$name'... "

  response=$(curl -s -X POST "$API_URL/agent-to-agent/$ORG_SLUG/$AGENT_SLUG/tasks" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"method\": \"dashboard.dimensions.create\",
      \"params\": {
        \"mode\": \"dashboard\",
        \"payload\": {
          \"action\": \"dimensions.create\",
          \"params\": {
            \"scopeId\": \"$SCOPE_ID\",
            \"slug\": \"$slug\",
            \"name\": \"$name\",
            \"description\": \"$description\",
            \"weight\": $weight,
            \"displayOrder\": $order
          }
        },
        \"context\": {
          \"orgSlug\": \"$ORG_SLUG\",
          \"userId\": \"$USER_ID\",
          \"conversationId\": \"$conv_id\",
          \"taskId\": \"$task_id\",
          \"planId\": \"$plan_id\",
          \"deliverableId\": \"$del_id\",
          \"agentSlug\": \"$AGENT_SLUG\",
          \"agentType\": \"runner\",
          \"provider\": \"anthropic\",
          \"model\": \"claude-3-5-sonnet-latest\"
        }
      },
      \"id\": \"create-dim-$slug\"
    }")

  if echo "$response" | grep -q '"success":true'; then
    echo -e "${GREEN}OK${NC}"
    return 0
  else
    echo -e "${RED}FAILED${NC}"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    return 1
  fi
}

# Create 2 key dimensions for investment risk analysis
echo "========================================="
echo "Creating Market Risk Dimension"
echo "========================================="
create_dimension \
  "market" \
  "Market Risk" \
  "Analyzes market-related risks including volatility, liquidity, and systemic market factors" \
  1.2 \
  1

echo ""
echo "========================================="
echo "Creating Fundamental Risk Dimension"
echo "========================================="
create_dimension \
  "fundamental" \
  "Fundamental Risk" \
  "Analyzes company fundamentals including financial health, earnings quality, and business model risks" \
  1.0 \
  2

echo ""
echo "========================================="
echo "Verifying dimensions"
echo "========================================="
echo -n "Listing dimensions for scope... "

list_task_id=$(generate_uuid)
list_plan_id=$(generate_uuid)
list_del_id=$(generate_uuid)
list_conv_id=$(generate_uuid)

response=$(curl -s -X POST "$API_URL/agent-to-agent/$ORG_SLUG/$AGENT_SLUG/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"dashboard.dimensions.list\",
    \"params\": {
      \"mode\": \"dashboard\",
      \"payload\": {
        \"action\": \"dimensions.list\",
        \"params\": {
          \"scopeId\": \"$SCOPE_ID\"
        }
      },
      \"context\": {
        \"orgSlug\": \"$ORG_SLUG\",
        \"userId\": \"$USER_ID\",
        \"conversationId\": \"$list_conv_id\",
        \"taskId\": \"$list_task_id\",
        \"planId\": \"$list_plan_id\",
        \"deliverableId\": \"$list_del_id\",
        \"agentSlug\": \"$AGENT_SLUG\",
        \"agentType\": \"runner\",
        \"provider\": \"anthropic\",
        \"model\": \"claude-3-5-sonnet-latest\"
      }
    },
    \"id\": \"list-dims\"
  }")

if echo "$response" | grep -q '"success":true'; then
  echo -e "${GREEN}OK${NC}"
  echo ""
  echo "Dimensions created:"
  echo "$response" | jq -r '.result.content[] | "  - \(.name) (\(.slug)) - weight: \(.weight)"' 2>/dev/null
else
  echo -e "${RED}FAILED${NC}"
  echo "$response" | jq . 2>/dev/null || echo "$response"
fi

echo ""
echo "Done!"

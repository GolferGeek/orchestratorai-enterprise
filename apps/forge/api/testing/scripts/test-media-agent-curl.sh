#!/bin/bash
# =============================================================================
# Media Agent E2E Tests via cURL
# =============================================================================
#
# Manual test script for Media Agents (image-generator, infographic-agent)
# Uses proper transport types (ExecutionContext) through the A2A API layer
#
# Prerequisites:
# - Supabase running (npm run dev:supabase)
# - API service running (npm run dev:api)
# - Environment variables set
# - Image generation models added to llm_models table
#
# Usage:
#   ./test-media-agent-curl.sh [agent-slug]
#
# Examples:
#   ./test-media-agent-curl.sh                    # Test infographic-agent (default)
#   ./test-media-agent-curl.sh image-generator    # Test image-generator
#   ./test-media-agent-curl.sh infographic-agent  # Test infographic-agent
#
# =============================================================================

set -e

# Load environment variables from .env file if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - Load from environment or use defaults
SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:6010}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-your-anon-key}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-your-service-role-key}"
API_URL="${API_URL:-http://127.0.0.1:6100}"

# Test user credentials
TEST_EMAIL="${SUPABASE_TEST_USER:-golfergeek@orchestratorai.io}"
TEST_PASSWORD="${SUPABASE_TEST_PASSWORD:-GolferGeek123!}"

# Agent selection (default: infographic-agent)
AGENT_SLUG="${1:-infographic-agent}"

# Determine organization based on agent
case "$AGENT_SLUG" in
  "image-generator")
    TEST_ORG="global"
    AGENT_TYPE="media"
    ;;
  "infographic-agent")
    TEST_ORG="demo"
    AGENT_TYPE="media"
    ;;
  *)
    TEST_ORG="demo"
    AGENT_TYPE="media"
    ;;
esac

# Validate required environment variables
if [ "$SUPABASE_SERVICE_ROLE_KEY" = "your-service-role-key" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo -e "${RED}Error: SUPABASE_SERVICE_ROLE_KEY is not set${NC}"
  echo "Please set it in your .env file or export it before running this script"
  exit 1
fi

# Generate unique IDs for this test run
TASK_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
CONVERSATION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
PLAN_ID="00000000-0000-0000-0000-000000000000"
DELIVERABLE_ID="00000000-0000-0000-0000-000000000000"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE} Media Agent cURL E2E Tests (via A2A API)${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  SUPABASE_URL: $SUPABASE_URL"
echo "  API_URL: $API_URL"
echo "  AGENT_SLUG: $AGENT_SLUG"
echo "  ORGANIZATION: $TEST_ORG"
echo "  TASK_ID: $TASK_ID"
echo "  CONVERSATION_ID: $CONVERSATION_ID"
echo ""

# =============================================================================
# Helper Functions
# =============================================================================

log_test() {
  echo ""
  echo -e "${BLUE}--- TEST: $1 ---${NC}"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
}

log_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

# =============================================================================
# Test 0: Authenticate and get token
# =============================================================================

log_test "0. Authenticate with Supabase"

AUTH_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

AUTH_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.access_token // empty')

if [ -n "$AUTH_TOKEN" ] && [ "$AUTH_TOKEN" != "null" ]; then
  log_success "Authenticated successfully"
  log_info "Token: ${AUTH_TOKEN:0:20}..."

  # Extract user ID from auth response
  TEST_USER_ID=$(echo "$AUTH_RESPONSE" | jq -r '.user.id // empty')
  if [ -z "$TEST_USER_ID" ] || [ "$TEST_USER_ID" = "null" ]; then
    log_fail "Could not extract user ID from auth response"
    exit 1
  fi
  log_info "User ID: $TEST_USER_ID"
else
  log_fail "Authentication failed"
  echo "$AUTH_RESPONSE" | jq .
  exit 1
fi

# =============================================================================
# Test 1: Check Agent Exists
# =============================================================================

log_test "1. Verify Agent Exists"

AGENT_CARD_RESPONSE=$(curl -s -X GET "$API_URL/agent-to-agent/$TEST_ORG/$AGENT_SLUG/.well-known/agent.json" \
  -H "Authorization: Bearer $AUTH_TOKEN")

AGENT_NAME=$(echo "$AGENT_CARD_RESPONSE" | jq -r '.name // empty')

if [ -n "$AGENT_NAME" ] && [ "$AGENT_NAME" != "null" ]; then
  log_success "Agent found: $AGENT_NAME"
  AGENT_DESCRIPTION=$(echo "$AGENT_CARD_RESPONSE" | jq -r '.description // "No description"')
  log_info "Description: $AGENT_DESCRIPTION"
else
  log_fail "Agent not found"
  echo "$AGENT_CARD_RESPONSE" | jq .
  log_info "You may need to run the migration first:"
  log_info "  cd apps/api && npx supabase migration up"
  exit 1
fi

# =============================================================================
# Test 2: Define Test Prompt Based on Agent
# =============================================================================

log_test "2. Configure Test Parameters"

# Define provider/model for image generation (using latest models)
IMAGE_PROVIDER="openai"
IMAGE_MODEL="gpt-image-1.5"

# Define test prompt based on agent type
case "$AGENT_SLUG" in
  "image-generator")
    USER_MESSAGE="A serene mountain landscape at sunset with a lake reflection, digital art style"
    IMAGE_SIZE="1024x1024"
    IMAGE_QUALITY="standard"
    IMAGE_STYLE="vivid"
    ;;
  "infographic-agent")
    USER_MESSAGE="Create an infographic about the benefits of renewable energy: solar, wind, and hydro power. Include statistics and icons."
    IMAGE_SIZE="1024x1792"  # Portrait for infographics
    IMAGE_QUALITY="hd"
    IMAGE_STYLE="natural"
    ;;
  *)
    USER_MESSAGE="A beautiful sunset over the ocean"
    IMAGE_SIZE="1024x1024"
    IMAGE_QUALITY="standard"
    IMAGE_STYLE="natural"
    ;;
esac

log_success "Test parameters configured"
log_info "Provider: $IMAGE_PROVIDER"
log_info "Model: $IMAGE_MODEL"
log_info "Prompt: ${USER_MESSAGE:0:80}..."

# =============================================================================
# Test 3: Execute Media Agent via A2A API
# =============================================================================

log_test "3. Execute Media Agent via A2A API"

log_info "This may take 30-60 seconds for image generation..."

# Build the ExecutionContext as required by A2A protocol
# IMPORTANT: ExecutionContext is the "capsule" - complete context for tracing
EXECUTION_CONTEXT=$(jq -n \
  --arg orgSlug "$TEST_ORG" \
  --arg userId "$TEST_USER_ID" \
  --arg conversationId "$CONVERSATION_ID" \
  --arg taskId "$TASK_ID" \
  --arg planId "$PLAN_ID" \
  --arg deliverableId "$DELIVERABLE_ID" \
  --arg agentSlug "$AGENT_SLUG" \
  --arg agentType "$AGENT_TYPE" \
  --arg provider "$IMAGE_PROVIDER" \
  --arg model "$IMAGE_MODEL" \
  '{
    "orgSlug": $orgSlug,
    "userId": $userId,
    "conversationId": $conversationId,
    "taskId": $taskId,
    "planId": $planId,
    "deliverableId": $deliverableId,
    "agentSlug": $agentSlug,
    "agentType": $agentType,
    "provider": $provider,
    "model": $model
  }' | jq -c .)

# Call the A2A endpoint using JSON-RPC format
# Mode: build (for media generation)
EXECUTE_RESPONSE=$(curl -s -X POST "$API_URL/agent-to-agent/$TEST_ORG/$AGENT_SLUG/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": \"1\",
    \"method\": \"build.execute\",
    \"params\": {
      \"mode\": \"build\",
      \"context\": $EXECUTION_CONTEXT,
      \"userMessage\": $(echo "$USER_MESSAGE" | jq -R .),
      \"payload\": {
        \"size\": \"$IMAGE_SIZE\",
        \"quality\": \"$IMAGE_QUALITY\",
        \"style\": \"$IMAGE_STYLE\",
        \"numberOfImages\": 1
      }
    }
  }")

# Check for errors first
ERROR_CODE=$(echo "$EXECUTE_RESPONSE" | jq -r '.error.code // empty')

if [ -n "$ERROR_CODE" ] && [ "$ERROR_CODE" != "null" ]; then
  log_fail "Request failed with error"
  echo "$EXECUTE_RESPONSE" | jq '.error'

  # Common error handling
  case "$ERROR_CODE" in
    "-32004")
      log_info "Agent not found. Check that the migration has been run."
      ;;
    "-32602")
      log_info "Invalid parameters. Check the request format."
      ;;
    "-32603")
      log_info "Internal server error. Check API logs for details."
      ;;
  esac
  exit 1
fi

# Extract result
RESULT_STATUS=$(echo "$EXECUTE_RESPONSE" | jq -r '.result.status // .result.payload.status // empty')

if [ "$RESULT_STATUS" = "completed" ] || [ "$RESULT_STATUS" = "success" ]; then
  log_success "Media generation completed"

  # Extract image information
  IMAGES=$(echo "$EXECUTE_RESPONSE" | jq -r '.result.payload.images // .result.images // []')
  IMAGE_COUNT=$(echo "$IMAGES" | jq 'length')

  log_info "Images generated: $IMAGE_COUNT"

  if [ "$IMAGE_COUNT" -gt 0 ]; then
    # Show first image details
    FIRST_IMAGE=$(echo "$IMAGES" | jq '.[0]')
    ASSET_ID=$(echo "$FIRST_IMAGE" | jq -r '.assetId // "N/A"')
    IMAGE_URL=$(echo "$FIRST_IMAGE" | jq -r '.url // "N/A"')
    MIME_TYPE=$(echo "$FIRST_IMAGE" | jq -r '.mimeType // "image/png"')

    log_info "Asset ID: $ASSET_ID"
    log_info "URL: ${IMAGE_URL:0:80}..."
    log_info "MIME Type: $MIME_TYPE"
  fi

  # Extract deliverable ID if created
  RESULT_DELIVERABLE_ID=$(echo "$EXECUTE_RESPONSE" | jq -r '.result.context.deliverableId // .result.deliverableId // empty')
  if [ -n "$RESULT_DELIVERABLE_ID" ] && [ "$RESULT_DELIVERABLE_ID" != "null" ] && [ "$RESULT_DELIVERABLE_ID" != "$DELIVERABLE_ID" ]; then
    log_info "Deliverable ID: $RESULT_DELIVERABLE_ID"
  fi
else
  log_info "Response status: $RESULT_STATUS"
  echo "$EXECUTE_RESPONSE" | jq .
fi

# =============================================================================
# Test 4: Verify Task in Database
# =============================================================================

log_test "4. Verify Task in Database"

TASK_RESPONSE=$(curl -s "$SUPABASE_URL/rest/v1/agent_tasks?id=eq.$TASK_ID&select=id,status,agent_name,response" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

TASK_COUNT=$(echo "$TASK_RESPONSE" | jq 'length')

if [ "$TASK_COUNT" -gt 0 ]; then
  log_success "Task found in database"
  TASK_STATUS=$(echo "$TASK_RESPONSE" | jq -r '.[0].status // "unknown"')
  TASK_AGENT=$(echo "$TASK_RESPONSE" | jq -r '.[0].agent_name // "unknown"')
  log_info "Status: $TASK_STATUS"
  log_info "Agent: $TASK_AGENT"
else
  log_info "Task not yet in database (may be async)"
fi

# =============================================================================
# Test 5: Verify Assets in Database
# =============================================================================

log_test "5. Verify Assets in Database"

ASSETS_RESPONSE=$(curl -s "$SUPABASE_URL/rest/v1/assets?conversation_id=eq.$CONVERSATION_ID&select=id,bucket,mime,width,height,created_at" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

ASSET_COUNT=$(echo "$ASSETS_RESPONSE" | jq 'length')

if [ "$ASSET_COUNT" -gt 0 ]; then
  log_success "Assets found: $ASSET_COUNT"
  echo "$ASSETS_RESPONSE" | jq -c '.[] | {id: .id[:8], bucket, mime, width, height}'
else
  log_info "No assets found in database (check storage configuration)"
fi

# =============================================================================
# Test 6: Verify Deliverable Versions (if created)
# =============================================================================

log_test "6. Verify Deliverable Versions"

if [ -n "$RESULT_DELIVERABLE_ID" ] && [ "$RESULT_DELIVERABLE_ID" != "null" ] && [ "$RESULT_DELIVERABLE_ID" != "$DELIVERABLE_ID" ]; then
  DELIVERABLE_RESPONSE=$(curl -s "$SUPABASE_URL/rest/v1/deliverable_versions?deliverable_id=eq.$RESULT_DELIVERABLE_ID&select=id,format,created_by_type,file_attachments" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

  VERSION_COUNT=$(echo "$DELIVERABLE_RESPONSE" | jq 'length')

  if [ "$VERSION_COUNT" -gt 0 ]; then
    log_success "Deliverable versions found: $VERSION_COUNT"
    echo "$DELIVERABLE_RESPONSE" | jq -c '.[] | {id: .id[:8], format, created_by_type, has_attachments: (.file_attachments != null)}'
  else
    log_info "No deliverable versions found"
  fi
else
  log_info "No deliverable ID returned - skipping deliverable check"
fi

# =============================================================================
# Cleanup Instructions
# =============================================================================

log_test "Cleanup"

log_info "To clean up test data, run:"
echo "  # Delete task"
echo "  curl -X DELETE \"$SUPABASE_URL/rest/v1/agent_tasks?id=eq.$TASK_ID\" -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\""
echo ""
echo "  # Delete assets"
echo "  curl -X DELETE \"$SUPABASE_URL/rest/v1/assets?conversation_id=eq.$CONVERSATION_ID\" -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\""

echo ""
echo -e "${BLUE}==============================================================================${NC}"
echo -e "${GREEN}Tests Complete!${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""
echo "Task ID: $TASK_ID"
echo "Conversation ID: $CONVERSATION_ID"
echo ""

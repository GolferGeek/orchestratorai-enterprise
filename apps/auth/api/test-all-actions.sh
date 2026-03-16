#!/bin/bash

# Comprehensive HTTP API Test for ALL Plan and Deliverable Actions
# Tests the FULL backend like the frontend will use it

set -e  # Exit on any error

API_BASE="http://localhost:6100"
AGENT_SLUG="blog_post_writer"
ORG_SLUG="my-org"

echo "========================================="
echo "COMPREHENSIVE BACKEND API TEST"
echo "Testing ALL Plan & Deliverable Actions"
echo "========================================="
echo ""

# Get auth token
echo "1. Authenticating..."
TOKEN=$(curl -s http://127.0.0.1:6010/auth/v1/token?grant_type=password \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo.user@orchestratorai.io","password":"DemoUser123!"}' \
  | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Authentication failed!"
  exit 1
fi
echo "✅ Authenticated"
echo ""

# Create conversation
echo "2. Creating test conversation..."
CONV_ID=$(uuidgen | tr 'A-Z' 'a-z')
psql postgresql://postgres:postgres@127.0.0.1:6012/postgres -c \
  "INSERT INTO conversations (id, user_id, agent_name, agent_type, started_at, last_active_at, metadata)
   VALUES ('$CONV_ID', 'b29a590e-b07f-49df-a25b-574c956b5035', '$AGENT_SLUG', 'context', NOW(), NOW(), '{\"test\": true}');" > /dev/null
echo "✅ Conversation created: $CONV_ID"
echo ""

# Helper function to call API
call_api() {
  local mode=$1
  local action=$2
  local extra_params=$3
  local task_id=$(uuidgen | tr 'A-Z' 'a-z')

  curl -s -X POST "$API_BASE/agent-to-agent/$ORG_SLUG/$AGENT_SLUG/tasks" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"mode\": \"$mode\",
      \"conversationId\": \"$CONV_ID\",
      \"userMessage\": \"Test message\",
      \"payload\": {
        \"taskId\": \"$task_id\",
        \"action\": \"$action\",
        \"llmSelection\": {
          \"provider\": \"ollama\",
          \"model\": \"llama3.2:1b\"
        }
        $extra_params
      }
    }"
}

# ==========================================
# PLAN ACTIONS (10 total)
# ==========================================
echo "========================================="
echo "TESTING PLAN ACTIONS"
echo "========================================="
echo ""

echo "PLAN Action 1/10: CREATE..."
PLAN_RESULT=$(call_api "plan" "create" ', "title": "Test Plan", "content": "# Plan\n\n1. Step one", "format": "markdown"')
PLAN_SUCCESS=$(echo "$PLAN_RESULT" | jq -r '.success')
if [ "$PLAN_SUCCESS" = "true" ]; then
  PLAN_ID=$(echo "$PLAN_RESULT" | jq -r '.payload.content.plan.id')
  VERSION_ID=$(echo "$PLAN_RESULT" | jq -r '.payload.content.version.id')
  echo "✅ PLAN CREATE succeeded (Plan ID: ${PLAN_ID:0:8}...)"
else
  echo "❌ PLAN CREATE failed"
  echo "$PLAN_RESULT" | jq '.'
  exit 1
fi

echo "PLAN Action 2/10: READ..."
READ_RESULT=$(call_api "plan" "read" '')
READ_SUCCESS=$(echo "$READ_RESULT" | jq -r '.success')
if [ "$READ_SUCCESS" = "true" ]; then
  echo "✅ PLAN READ succeeded"
else
  echo "❌ PLAN READ failed"
  exit 1
fi

echo "PLAN Action 3/10: CREATE (refine)..."
REFINE_RESULT=$(call_api "plan" "create" ', "title": "Test Plan", "content": "# Plan v2\n\n1. Step one\n2. Step two", "format": "markdown"')
REFINE_SUCCESS=$(echo "$REFINE_RESULT" | jq -r '.success')
if [ "$REFINE_SUCCESS" = "true" ]; then
  VERSION_ID2=$(echo "$REFINE_RESULT" | jq -r '.payload.content.version.id')
  echo "✅ PLAN REFINE succeeded"
else
  echo "❌ PLAN REFINE failed"
  exit 1
fi

echo "PLAN Action 4/10: LIST..."
LIST_RESULT=$(call_api "plan" "list" '')
LIST_SUCCESS=$(echo "$LIST_RESULT" | jq -r '.success')
if [ "$LIST_SUCCESS" = "true" ]; then
  VERSION_COUNT=$(echo "$LIST_RESULT" | jq '.payload.content.versions | length')
  echo "✅ PLAN LIST succeeded ($VERSION_COUNT versions)"
else
  echo "❌ PLAN LIST failed"
  exit 1
fi

echo "PLAN Action 5/10: EDIT..."
EDIT_RESULT=$(call_api "plan" "edit" ', "content": "# Edited Plan\n\nUser changes"')
EDIT_SUCCESS=$(echo "$EDIT_RESULT" | jq -r '.success')
if [ "$EDIT_SUCCESS" = "true" ]; then
  echo "✅ PLAN EDIT succeeded"
else
  echo "❌ PLAN EDIT failed"
  exit 1
fi

echo "PLAN Action 6/10: RERUN..."
RERUN_RESULT=$(call_api "plan" "rerun" ", \"versionId\": \"$VERSION_ID\", \"rerunConfig\": {\"provider\": \"ollama\", \"model\": \"mistral:7b\", \"temperature\": 0.7}")
RERUN_SUCCESS=$(echo "$RERUN_RESULT" | jq -r '.success')
if [ "$RERUN_SUCCESS" = "true" ]; then
  RERUN_VERSION_ID=$(echo "$RERUN_RESULT" | jq -r '.payload.content.version.id')
  RERUN_VERSION_NUM=$(echo "$RERUN_RESULT" | jq -r '.payload.content.version.versionNumber')
  echo "✅ PLAN RERUN succeeded (New version: $RERUN_VERSION_NUM)"
else
  echo "❌ PLAN RERUN failed"
  echo "$RERUN_RESULT" | jq '.'
  exit 1
fi

echo "PLAN Action 7/10: SET_CURRENT..."
SET_RESULT=$(call_api "plan" "set_current" ", \"versionId\": \"$VERSION_ID\"")
SET_SUCCESS=$(echo "$SET_RESULT" | jq -r '.success')
if [ "$SET_SUCCESS" = "true" ]; then
  echo "✅ PLAN SET_CURRENT succeeded"
else
  echo "❌ PLAN SET_CURRENT failed"
  exit 1
fi

echo "PLAN Action 8/10: COPY_VERSION..."
COPY_RESULT=$(call_api "plan" "copy_version" ", \"versionId\": \"$VERSION_ID2\"")
COPY_SUCCESS=$(echo "$COPY_RESULT" | jq -r '.success')
if [ "$COPY_SUCCESS" = "true" ]; then
  echo "✅ PLAN COPY_VERSION succeeded"
else
  echo "❌ PLAN COPY_VERSION failed"
  exit 1
fi

echo "PLAN Action 9/10: DELETE_VERSION..."
DELETE_V_RESULT=$(call_api "plan" "delete_version" ", \"versionId\": \"$VERSION_ID2\"")
DELETE_V_SUCCESS=$(echo "$DELETE_V_RESULT" | jq -r '.success')
if [ "$DELETE_V_SUCCESS" = "true" ]; then
  echo "✅ PLAN DELETE_VERSION succeeded"
else
  echo "❌ PLAN DELETE_VERSION failed"
  exit 1
fi

echo "PLAN Action 10/10: DELETE..."
DELETE_RESULT=$(call_api "plan" "delete" '')
DELETE_SUCCESS=$(echo "$DELETE_RESULT" | jq -r '.success')
if [ "$DELETE_SUCCESS" = "true" ]; then
  echo "✅ PLAN DELETE succeeded"
else
  echo "❌ PLAN DELETE failed"
  exit 1
fi

echo ""
echo "✅ ALL 10 PLAN ACTIONS PASSED!"
echo ""

# ==========================================
# DELIVERABLE ACTIONS (10 total)
# ==========================================
echo "========================================="
echo "TESTING DELIVERABLE ACTIONS"
echo "========================================="
echo ""

echo "DELIVERABLE Action 1/10: CREATE..."
DELIV_RESULT=$(call_api "build" "create" ', "title": "Test Doc", "content": "# Document\n\nContent here", "format": "markdown", "type": "document"')
DELIV_SUCCESS=$(echo "$DELIV_RESULT" | jq -r '.success')
if [ "$DELIV_SUCCESS" = "true" ]; then
  DELIV_ID=$(echo "$DELIV_RESULT" | jq -r '.payload.content.deliverable.id')
  DELIV_VER_ID=$(echo "$DELIV_RESULT" | jq -r '.payload.content.version.id')
  echo "✅ DELIVERABLE CREATE succeeded"
else
  echo "❌ DELIVERABLE CREATE failed"
  echo "$DELIV_RESULT" | jq '.'
  exit 1
fi

echo "DELIVERABLE Action 2/10: READ..."
DELIV_READ=$(call_api "build" "read" '')
if [ "$(echo "$DELIV_READ" | jq -r '.success')" = "true" ]; then
  echo "✅ DELIVERABLE READ succeeded"
else
  echo "❌ DELIVERABLE READ failed"
  exit 1
fi

echo "DELIVERABLE Action 3/10: CREATE (enhance)..."
DELIV_ENHANCE=$(call_api "build" "create" ', "title": "Test Doc", "content": "# Enhanced Document\n\nMore content", "format": "markdown", "type": "document"')
if [ "$(echo "$DELIV_ENHANCE" | jq -r '.success')" = "true" ]; then
  DELIV_VER_ID2=$(echo "$DELIV_ENHANCE" | jq -r '.payload.content.version.id')
  echo "✅ DELIVERABLE ENHANCE succeeded"
else
  echo "❌ DELIVERABLE ENHANCE failed"
  exit 1
fi

echo "DELIVERABLE Action 4/10: LIST..."
DELIV_LIST=$(call_api "build" "list" '')
if [ "$(echo "$DELIV_LIST" | jq -r '.success')" = "true" ]; then
  echo "✅ DELIVERABLE LIST succeeded"
else
  echo "❌ DELIVERABLE LIST failed"
  exit 1
fi

echo "DELIVERABLE Action 5/10: EDIT..."
DELIV_EDIT=$(call_api "build" "edit" ', "content": "# User Edited\n\nManual changes"')
if [ "$(echo "$DELIV_EDIT" | jq -r '.success')" = "true" ]; then
  echo "✅ DELIVERABLE EDIT succeeded"
else
  echo "❌ DELIVERABLE EDIT failed"
  exit 1
fi

echo "DELIVERABLE Action 6/10: SET_CURRENT..."
DELIV_SET=$(call_api "build" "set_current" ", \"versionId\": \"$DELIV_VER_ID\"")
if [ "$(echo "$DELIV_SET" | jq -r '.success')" = "true" ]; then
  echo "✅ DELIVERABLE SET_CURRENT succeeded"
else
  echo "❌ DELIVERABLE SET_CURRENT failed"
  exit 1
fi

echo "DELIVERABLE Action 7/10: COPY_VERSION..."
DELIV_COPY=$(call_api "build" "copy_version" ", \"versionId\": \"$DELIV_VER_ID2\"")
if [ "$(echo "$DELIV_COPY" | jq -r '.success')" = "true" ]; then
  echo "✅ DELIVERABLE COPY_VERSION succeeded"
else
  echo "❌ DELIVERABLE COPY_VERSION failed"
  exit 1
fi

echo "DELIVERABLE Action 8/10: DELETE_VERSION..."
DELIV_DELETE_V=$(call_api "build" "delete_version" ", \"versionId\": \"$DELIV_VER_ID2\"")
if [ "$(echo "$DELIV_DELETE_V" | jq -r '.success')" = "true" ]; then
  echo "✅ DELIVERABLE DELETE_VERSION succeeded"
else
  echo "❌ DELIVERABLE DELETE_VERSION failed"
  exit 1
fi

echo "DELIVERABLE Action 9/10: MERGE_VERSIONS..."
# Create two more versions to merge
DELIV_V3=$(call_api "build" "create" ', "title": "Version 3", "content": "# Version 3\n\nThird version content", "format": "markdown", "type": "document"')
DELIV_V3_ID=$(echo "$DELIV_V3" | jq -r '.payload.content.version.id')

DELIV_V4=$(call_api "build" "create" ', "title": "Version 4", "content": "# Version 4\n\nFourth version content", "format": "markdown", "type": "document"')
DELIV_V4_ID=$(echo "$DELIV_V4" | jq -r '.payload.content.version.id')

# Now merge versions 3 and 4
DELIV_MERGE=$(call_api "build" "merge_versions" ", \"versionIds\": [\"$DELIV_V3_ID\", \"$DELIV_V4_ID\"], \"mergePrompt\": \"Combine both versions, keeping all unique information\"")
if [ "$(echo "$DELIV_MERGE" | jq -r '.success')" = "true" ]; then
  echo "✅ DELIVERABLE MERGE_VERSIONS succeeded"
else
  echo "❌ DELIVERABLE MERGE_VERSIONS failed"
  echo "$DELIV_MERGE" | jq '.'
  exit 1
fi

echo "DELIVERABLE Action 10/10: DELETE..."
DELIV_DELETE=$(call_api "build" "delete" '')
if [ "$(echo "$DELIV_DELETE" | jq -r '.success')" = "true" ]; then
  echo "✅ DELIVERABLE DELETE succeeded"
else
  echo "❌ DELIVERABLE DELETE failed"
  exit 1
fi

echo ""
echo "✅ ALL 10 DELIVERABLE ACTIONS PASSED!"
echo ""

# Cleanup
echo "Cleaning up test conversation..."
# Delete tasks first to avoid foreign key constraint
psql postgresql://postgres:postgres@127.0.0.1:6012/postgres -c \
  "DELETE FROM tasks WHERE conversation_id = '$CONV_ID';" > /dev/null 2>&1
# Then delete conversation
psql postgresql://postgres:postgres@127.0.0.1:6012/postgres -c \
  "DELETE FROM conversations WHERE id = '$CONV_ID';" > /dev/null 2>&1
echo "✅ Cleanup complete"
echo ""

echo "========================================="
echo "✅ ALL TESTS PASSED!"
echo "========================================="
echo "Summary:"
echo "  • 10/10 Plan actions working"
echo "  • 10/10 Deliverable actions working"
echo "  • Total: 20/20 actions tested successfully"
echo "========================================="

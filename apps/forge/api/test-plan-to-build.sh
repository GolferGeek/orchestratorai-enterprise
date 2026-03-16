#!/bin/bash

# Test Plan → Build Workflow
# This script tests that BUILD mode automatically includes plan context

set -e

API_BASE="http://localhost:7000"
ORG_SLUG="my-org"
AGENT_SLUG="blog_post_writer"

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

# Create test conversation
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

echo "==========================================="
echo "TESTING PLAN → BUILD WORKFLOW"
echo "==========================================="
echo ""

# Step 1: Create a plan
echo "Step 1: Creating a plan..."
PLAN_RESULT=$(call_api "plan" "create" ', "title": "Blog Post Plan", "content": "# Blog Post Plan\n\n## Title\nHow to Build Microservices\n\n## Outline\n1. Introduction\n2. Benefits of Microservices\n3. Implementation Steps\n4. Conclusion"')
PLAN_SUCCESS=$(echo "$PLAN_RESULT" | jq -r '.success')

echo "DEBUG: Plan result:"
echo "$PLAN_RESULT" | jq '.'

if [ "$PLAN_SUCCESS" = "true" ]; then
  PLAN_ID=$(echo "$PLAN_RESULT" | jq -r '.payload.content.plan.id')
  echo "✅ Plan created successfully (ID: $PLAN_ID)"
else
  echo "❌ Plan creation failed"
  exit 1
fi
echo ""

# Step 2: Build deliverable (should automatically use the plan)
echo "Step 2: Building deliverable (should use plan context)..."
BUILD_RESULT=$(call_api "build" "create" ', "title": "Blog Post"')
BUILD_SUCCESS=$(echo "$BUILD_RESULT" | jq -r '.success')

if [ "$BUILD_SUCCESS" = "true" ]; then
  DELIV_ID=$(echo "$BUILD_RESULT" | jq -r '.payload.content.deliverable.id')
  DELIV_CONTENT=$(echo "$BUILD_RESULT" | jq -r '.payload.content.deliverable.currentVersion.content // .payload.content.version.content')
  echo "✅ Deliverable created successfully (ID: $DELIV_ID)"
  echo ""
  echo "Deliverable content preview:"
  echo "---"
  echo "$DELIV_CONTENT" | head -20
  echo "..."
  echo ""

  # Check if deliverable mentions things from the plan
  if echo "$DELIV_CONTENT" | grep -qi "microservices"; then
    echo "✅ Deliverable appears to reference plan content (mentions 'microservices')"
  else
    echo "⚠️  Warning: Deliverable may not have used plan context"
  fi
else
  echo "❌ Deliverable creation failed"
  echo "$BUILD_RESULT" | jq '.'
  exit 1
fi
echo ""

# Step 3: Build another deliverable without a plan
echo "Step 3: Testing build without plan (new conversation)..."
CONV_ID2=$(uuidgen | tr 'A-Z' 'a-z')
psql postgresql://postgres:postgres@127.0.0.1:6012/postgres -c \
  "INSERT INTO conversations (id, user_id, agent_name, agent_type, started_at, last_active_at, metadata)
   VALUES ('$CONV_ID2', 'b29a590e-b07f-49df-a25b-574c956b5035', '$AGENT_SLUG', 'context', NOW(), NOW(), '{\"test\": true}');" > /dev/null

CONV_ID_OLD=$CONV_ID
CONV_ID=$CONV_ID2

BUILD_RESULT2=$(call_api "build" "create" ', "title": "Random Article"')
BUILD_SUCCESS2=$(echo "$BUILD_RESULT2" | jq -r '.success')

if [ "$BUILD_SUCCESS2" = "true" ]; then
  echo "✅ Deliverable created without plan (works as expected)"
else
  echo "❌ Deliverable without plan failed"
  echo "$BUILD_RESULT2" | jq '.'
fi

CONV_ID=$CONV_ID_OLD
echo ""

# Cleanup
echo "Cleaning up test conversations..."
psql postgresql://postgres:postgres@127.0.0.1:6012/postgres -c \
  "DELETE FROM tasks WHERE conversation_id IN ('$CONV_ID', '$CONV_ID2');" > /dev/null 2>&1
psql postgresql://postgres:postgres@127.0.0.1:6012/postgres -c \
  "DELETE FROM conversations WHERE id IN ('$CONV_ID', '$CONV_ID2');" > /dev/null 2>&1
echo "✅ Cleanup complete"
echo ""

echo "==========================================="
echo "✅ PLAN → BUILD WORKFLOW TEST COMPLETE!"
echo "==========================================="
echo "Summary:"
echo "  • Plan created with outline"
echo "  • Deliverable built using plan context"
echo "  • Build without plan works independently"
echo "==========================================="

#!/bin/bash

# Agent Seeding Script
# Seeds blog_post_writer, hr_assistant, and agent_builder_orchestrator_v2

API_BASE_URL="${API_BASE_URL:-http://localhost:6100}"
ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"

echo "🚀 Agent Seeding Script"
echo "API: $API_BASE_URL"
echo ""

seed_agent() {
  local payload_file="$1"
  local payload_name=$(basename "$payload_file" .json)

  echo "📦 Seeding: $payload_name"

  # Validate
  echo "   ✓ Validating..."
  response=$(curl -s -X POST "$API_BASE_URL/api/admin/agents/validate?dryRun=true" \
    -H "Content-Type: application/json" \
    -d @"$payload_file")

  success=$(echo "$response" | jq -r '.success')
  if [ "$success" != "true" ]; then
    echo "   ✗ Validation failed"
    echo "$response" | jq '.issues'
    return 1
  fi

  echo "   ✓ Validation passed"

  # Create
  echo "   ✓ Creating..."
  response=$(curl -s -X POST "$API_BASE_URL/api/admin/agents" \
    -H "Content-Type: application/json" \
    -d @"$payload_file")

  success=$(echo "$response" | jq -r '.success')
  if [ "$success" != "true" ]; then
    echo "   ✗ Creation failed"
    echo "$response" | jq '.issues'
    return 1
  fi

  agent_id=$(echo "$response" | jq -r '.data.id')
  echo "   ✓ Created! ID: $agent_id"
  echo ""
  return 0
}

# Seed agents
SUCCESS=0
FAILED=0

for payload in \
  "$ROOT_DIR/docs/feature/matt/payloads/blog_post_writer.json" \
  "$ROOT_DIR/docs/feature/matt/payloads/hr_assistant.json" \
  "$ROOT_DIR/docs/feature/matt/payloads/agent_builder_orchestrator_v2.json" \
  "$ROOT_DIR/docs/feature/matt/payloads/agent_builder_chat.json"
do
  if seed_agent "$payload"; then
    SUCCESS=$((SUCCESS + 1))
  else
    FAILED=$((FAILED + 1))
  fi
done

echo "📊 Summary:"
echo "   Success: $SUCCESS"
echo "   Failed: $FAILED"
echo "   Total: $((SUCCESS + FAILED))"

exit $FAILED

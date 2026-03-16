#!/bin/bash

# Get auth token
TOKEN=$(curl -s http://127.0.0.1:6010/auth/v1/token?grant_type=password \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo.user@orchestratorai.io","password":"DemoUser123!"}' \
  | jq -r '.access_token')

echo "Token: ${TOKEN:0:50}..."

# Get or create conversation
CONV_ID=$(psql postgresql://postgres:postgres@127.0.0.1:6012/postgres -t -c "SELECT id FROM conversations WHERE user_id='b29a590e-b07f-49df-a25b-574c956b5035' AND agent_name='blog_post_writer' LIMIT 1;" | tr -d ' ')

if [ -z "$CONV_ID" ]; then
  echo "Creating new conversation..."
  CONV_ID=$(uuidgen | tr 'A-Z' 'a-z')
  psql postgresql://postgres:postgres@127.0.0.1:6012/postgres -c "INSERT INTO conversations (id, user_id, agent_name, agent_type, started_at, last_active_at) VALUES ('$CONV_ID', 'b29a590e-b07f-49df-a25b-574c956b5035', 'blog_post_writer', 'context', NOW(), NOW());"
fi

echo "Conversation ID: $CONV_ID"

TASK_ID=$(uuidgen | tr "A-Z" "a-z")
echo "Task ID: $TASK_ID"

# Make API call
echo "Calling API..."
curl -v -X POST http://localhost:6100/agent-to-agent/my-org/blog_post_writer/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "plan",
    "conversationId": "'"$CONV_ID"'",
    "userMessage": "Create a simple plan",
    "payload": {
      "taskId": "'"$TASK_ID"'",
      "action": "create",
      "title": "Test Plan",
      "content": "# Test\n\n1. Step one\n2. Step two",
      "format": "markdown",
      "llmSelection": {
        "provider": "ollama",
        "model": "llama3.2:1b"
      }
    }
  }' 2>&1 | tee /tmp/api-response.log

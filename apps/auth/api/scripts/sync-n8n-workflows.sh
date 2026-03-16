#!/bin/bash
# Sync n8n workflows to Supabase for version control
# This script exports workflows from n8n and saves them to the database

set -e

# Source environment
source "$(dirname "$0")/../apps/n8n/.env"

echo "🔄 Syncing n8n workflows to Supabase..."

# Helper: LLM Task
echo "📥 Exporting Helper: LLM Task (9jxl03jCcqg17oOy)..."
HELPER_JSON=$(curl -s "http://localhost:5678/api/v1/workflows/9jxl03jCcqg17oOy" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}")

# Marketing Swarm - Flexible LLM
echo "📥 Exporting Marketing Swarm - Flexible LLM (1LaQnwqSoTxmnw3Z)..."
MARKETING_JSON=$(curl -s "http://localhost:5678/api/v1/workflows/1LaQnwqSoTxmnw3Z" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}")

# Insert into database
echo "💾 Saving workflows to Supabase..."

psql "${DATABASE_URL}" <<EOF
-- Insert Helper: LLM Task
INSERT INTO n8n.n8n_workflows (id, name, active, nodes, connections, settings, created_at, updated_at)
SELECT
  '9jxl03jCcqg17oOy'::uuid,
  'Helper: LLM Task',
  false,
  '${HELPER_JSON}'::jsonb->'nodes',
  '${HELPER_JSON}'::jsonb->'connections',
  '{}'::jsonb,
  NOW(),
  NOW()
ON CONFLICT (id) DO UPDATE SET
  nodes = EXCLUDED.nodes,
  connections = EXCLUDED.connections,
  updated_at = NOW();

-- Insert Marketing Swarm
INSERT INTO n8n.n8n_workflows (id, name, active, nodes, connections, settings, created_at, updated_at)
SELECT
  '1LaQnwqSoTxmnw3Z'::uuid,
  'Marketing Swarm - Flexible LLM',
  true,
  '${MARKETING_JSON}'::jsonb->'nodes',
  '${MARKETING_JSON}'::jsonb->'connections',
  '{}'::jsonb,
  NOW(),
  NOW()
ON CONFLICT (id) DO UPDATE SET
  nodes = EXCLUDED.nodes,
  connections = EXCLUDED.connections,
  active = EXCLUDED.active,
  updated_at = NOW();
EOF

echo "✅ Workflows synced to Supabase!"

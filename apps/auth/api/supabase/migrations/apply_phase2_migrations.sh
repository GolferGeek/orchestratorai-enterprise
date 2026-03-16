#!/bin/bash

# Apply Phase 2 migrations for prediction system
# Run from: /Users/golfergeek/projects/orchAI/orchestrator-ai-v2/apps/api/supabase/migrations/

set -e

MIGRATIONS_DIR="/Users/golfergeek/projects/orchAI/orchestrator-ai-v2/apps/api/supabase/migrations"
CONTAINER="supabase_db_api-dev"

echo "Applying Phase 2 Prediction System Migrations..."
echo "================================================"
echo ""

# Apply each migration in order
for migration in \
  "20260109000012_prediction_analysts.sql" \
  "20260109000013_prediction_learnings.sql" \
  "20260109000014_prediction_review_queue.sql" \
  "20260109000015_prediction_helper_functions.sql" \
  "20260109000016_prediction_seed_analysts.sql" \
  "20260109000017_prediction_analysts_rls.sql"
do
  echo "Applying: $migration"
  docker exec -i $CONTAINER psql -U postgres -d postgres < "$MIGRATIONS_DIR/$migration"
  if [ $? -eq 0 ]; then
    echo "✓ $migration applied successfully"
  else
    echo "✗ $migration failed"
    exit 1
  fi
  echo ""
done

echo "================================================"
echo "All Phase 2 migrations applied successfully!"
echo ""

# Verify tables were created
echo "Verifying tables..."
docker exec $CONTAINER psql -U postgres -d postgres -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'prediction'
  AND table_name IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
ORDER BY table_name;
"

echo ""
echo "Verifying analyst count..."
docker exec $CONTAINER psql -U postgres -d postgres -c "
SELECT
  scope_level,
  domain,
  COUNT(*) as count
FROM prediction.analysts
GROUP BY scope_level, domain
ORDER BY scope_level, domain;
"

echo ""
echo "Phase 2 migration complete!"

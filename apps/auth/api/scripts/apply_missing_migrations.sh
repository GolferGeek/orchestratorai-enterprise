#!/bin/bash

# Apply missing migrations starting from 2026
# Run from: /Users/nicholasweber/Sites/orchestrator-ai-v2

set -e

MIGRATIONS_DIR="apps/api/supabase/migrations"
CONTAINER="supabase_db_api-dev"
LAST_APPLIED="20251229100000"

echo "Checking for missing migrations..."
echo "================================================"

# Find migrations newer than the last applied one
# We use sort to ensure correct order
files=$(ls "$MIGRATIONS_DIR"/*.sql | sort)

for file in $files; do
    filename=$(basename "$file")
    version=$(echo "$filename" | cut -d'_' -f1)

    if [[ "$version" > "$LAST_APPLIED" ]]; then
        echo "Applying: $filename"
        docker exec -i $CONTAINER psql -U postgres -d postgres < "$file"

        # Update schema_migrations table manually if needed, or rely on supabase to track it?
        # Supabase usually tracks it automatically if run via CLI, but here we are running manually via psql.
        # We should insert into supabase_migrations.schema_migrations to avoid re-running if CLI is used later.
        
        docker exec -i $CONTAINER psql -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING;"
        
        if [ $? -eq 0 ]; then
            echo "✓ $filename applied successfully"
        else
            echo "✗ $filename failed"
            exit 1
        fi
        echo ""
    fi
done

echo "================================================"
echo "All missing migrations applied successfully!"

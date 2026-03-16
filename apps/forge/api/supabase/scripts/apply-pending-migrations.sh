#!/bin/bash
# Apply all pending migrations without resetting the database
# This script applies migrations in chronological order

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
MIGRATIONS_DIR="apps/api/supabase/migrations"
DB_CONTAINER="supabase_db_api-dev"

# Try to detect the actual container name
ACTUAL_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "supabase_db_(api-dev|api)$" | head -1)
if [ -z "$ACTUAL_CONTAINER" ]; then
    echo -e "${RED}❌ Error: Supabase database container not found${NC}"
    echo "   Please start Supabase: cd apps/api && npx supabase start"
    exit 1
fi

DB_CONTAINER="$ACTUAL_CONTAINER"
echo -e "${BLUE}Using container: $DB_CONTAINER${NC}"

# Get list of migrations to apply (recent ones)
MIGRATIONS=(
    "20250126000000_create_shared_tasks_view.sql"
    "20250126000001_restore_rag_schema_complete.sql"
    "20251229000001_add_missing_deliverable_versions_columns.sql"
    "20251229000002_fix_pseudonym_dictionaries_schema.sql"
    "20251229000003_fix_cidafm_commands_schema.sql"
    "20251229000004_fix_assets_media_columns.sql"
    "20251229100000_ensure_schema_complete.sql"
    "20251229200001_create_engineering_schema.sql"
    "20251229200002_create_engineering_storage_bucket.sql"
    "20251229200003_add_qwen_coder_model.sql"
    "20251229200004_add_engineering_org_and_user.sql"
    "20251229200005_add_langgraph_agent_type.sql"
    "20251229200006_register_cad_agent.sql"
    "20251230000001_allow_llm_config_for_api_agents.sql"
)

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔄 Applying Pending Migrations${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check which migrations have already been applied
echo -e "${BLUE}Checking migration status...${NC}"
APPLIED_MIGRATIONS=$(docker exec -e PGPASSWORD=postgres "$DB_CONTAINER" \
    psql -h localhost -p 5432 -U postgres -d postgres -t -c \
    "SELECT version::text FROM supabase_migrations ORDER BY version;" 2>/dev/null || echo "")

PENDING_COUNT=0
APPLIED_COUNT=0

for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_FILE="$MIGRATIONS_DIR/$migration"
    if [ ! -f "$MIGRATION_FILE" ]; then
        echo -e "${YELLOW}⚠️  Migration file not found: $migration${NC}"
        continue
    fi
    
    # Extract version from filename (format: YYYYMMDDHHMMSS_description.sql)
    VERSION=$(echo "$migration" | sed -E 's/^([0-9]{14})_.*/\1/')
    
    # Check if already applied
    if echo "$APPLIED_MIGRATIONS" | grep -q "^$VERSION$"; then
        echo -e "${GREEN}✅ Already applied: $migration${NC}"
        ((APPLIED_COUNT++))
    else
        echo -e "${YELLOW}⏳ Pending: $migration${NC}"
        ((PENDING_COUNT++))
    fi
done

echo ""
if [ "$PENDING_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ All migrations are already applied!${NC}"
    exit 0
fi

echo -e "${BLUE}Found $PENDING_COUNT pending migration(s)${NC}"
echo ""
read -p "Apply these migrations? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo "❌ Cancelled"
    exit 0
fi

echo ""
echo -e "${BLUE}Applying migrations...${NC}"
echo ""

# Apply each pending migration
FAILED=0
for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_FILE="$MIGRATIONS_DIR/$migration"
    if [ ! -f "$MIGRATION_FILE" ]; then
        continue
    fi
    
    VERSION=$(echo "$migration" | sed -E 's/^([0-9]{14})_.*/\1/')
    
    # Skip if already applied
    if echo "$APPLIED_MIGRATIONS" | grep -q "^$VERSION$"; then
        continue
    fi
    
    echo -e "${BLUE}Applying: $migration${NC}"
    
    # Apply the migration
    if docker exec -i -e PGPASSWORD=postgres "$DB_CONTAINER" \
        psql -h localhost -p 5432 -U postgres -d postgres \
        -v ON_ERROR_STOP=1 < "$MIGRATION_FILE" 2>&1 | grep -v "NOTICE:" | grep -v "already exists" || true; then
        
        # Record in supabase_migrations table
        MIGRATION_NAME=$(echo "$migration" | sed 's/^[0-9]*_//' | sed 's/\.sql$//')
        docker exec -e PGPASSWORD=postgres "$DB_CONTAINER" \
            psql -h localhost -p 5432 -U postgres -d postgres -c \
            "INSERT INTO supabase_migrations (version, name) VALUES ('$VERSION', '$MIGRATION_NAME') ON CONFLICT DO NOTHING;" \
            2>&1 | grep -v "NOTICE:" || true
        
        echo -e "${GREEN}✅ Applied: $migration${NC}"
    else
        echo -e "${RED}❌ Failed: $migration${NC}"
        FAILED=1
        break
    fi
    echo ""
done

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ All migrations applied successfully!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ Migration failed. Please check the output above.${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi


#!/bin/bash
# =============================================================================
# POST-RESTORE FIX SCRIPT
# =============================================================================
# Run this script after restoring a database backup to ensure all required
# schema changes are applied.
#
# Usage:
#   ./scripts/post-restore-fix.sh
#
# This script:
#   1. Applies the schema completeness migration
#   2. Verifies critical tables have required columns
#   3. Reports any issues found
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Post-Restore Database Fix"
echo "=========================================="

# Get database connection from supabase status
echo -e "${YELLOW}Getting database connection info...${NC}"
# The supabase status output uses box-drawing chars, extract URL with grep and sed
DB_URL=$(npx supabase status 2>/dev/null | grep "postgresql" | sed 's/.*postgresql/postgresql/' | sed 's/[│ ]*$//')

if [ -z "$DB_URL" ]; then
    echo -e "${RED}Error: Could not get database URL. Is Supabase running?${NC}"
    echo "Run: npx supabase start"
    exit 1
fi

# Extract connection details from URL
# Format: postgresql://user:pass@host:port/dbname
DB_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:]+):.*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')

echo "Database: $DB_HOST:$DB_PORT/$DB_NAME"

# Apply the schema completeness migration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/../migrations/20251229100000_ensure_schema_complete.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Applying schema completeness migration...${NC}"
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"

# Verify critical columns exist
echo ""
echo -e "${YELLOW}Verifying critical columns...${NC}"

verify_column() {
    local table=$1
    local column=$2
    local schema=${3:-public}

    result=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = '$schema'
        AND table_name = '$table'
        AND column_name = '$column';
    ")

    if [ "$(echo $result | tr -d ' ')" = "1" ]; then
        echo -e "  ${GREEN}✓${NC} $schema.$table.$column"
        return 0
    else
        echo -e "  ${RED}✗${NC} $schema.$table.$column - MISSING"
        return 1
    fi
}

# Check all critical columns
errors=0

echo "Checking pseudonym_dictionaries..."
verify_column "pseudonym_dictionaries" "data_type" || ((errors++))
verify_column "pseudonym_dictionaries" "category" || ((errors++))
verify_column "pseudonym_dictionaries" "is_active" || ((errors++))

echo "Checking cidafm_commands..."
verify_column "cidafm_commands" "is_builtin" || ((errors++))
verify_column "cidafm_commands" "name" || ((errors++))
verify_column "cidafm_commands" "type" || ((errors++))

echo "Checking assets..."
verify_column "assets" "storage" || ((errors++))
verify_column "assets" "bucket" || ((errors++))
verify_column "assets" "object_key" || ((errors++))

echo "Checking deliverable_versions..."
verify_column "deliverable_versions" "is_current_version" || ((errors++))
verify_column "deliverable_versions" "created_by_type" || ((errors++))

echo "Checking RAG tables (rag_data schema)..."
verify_column "rag_collections" "slug" "rag_data" || ((errors++))
verify_column "rag_documents" "collection_id" "rag_data" || ((errors++))
verify_column "rag_document_chunks" "embedding" "rag_data" || ((errors++))

echo ""
echo "=========================================="
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo "Database schema is complete."
else
    echo -e "${RED}$errors issues found!${NC}"
    echo "Some columns are missing. Check the output above."
    exit 1
fi
echo "=========================================="

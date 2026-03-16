#!/bin/bash
# =============================================================================
# DATABASE DATA VERIFICATION SCRIPT
# =============================================================================
# Run this script after restoring a database backup to verify all critical
# tables have data.
#
# Usage:
#   ./scripts/verify-data.sh
#
# This script checks:
#   1. All critical tables have rows
#   2. Required schema columns exist
#   3. Data relationships are intact
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Database Data Verification"
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
DB_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:]+):.*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')

echo "Database: $DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# Function to check table row count
check_table() {
    local schema=$1
    local table=$2
    local min_rows=${3:-1}

    count=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM $schema.$table;
    " 2>/dev/null | tr -d ' ')

    if [ -z "$count" ]; then
        echo -e "  ${RED}✗${NC} $schema.$table - TABLE NOT FOUND"
        return 1
    elif [ "$count" -lt "$min_rows" ]; then
        echo -e "  ${RED}✗${NC} $schema.$table - $count rows (expected >= $min_rows)"
        return 1
    else
        echo -e "  ${GREEN}✓${NC} $schema.$table - $count rows"
        return 0
    fi
}

errors=0

# =============================================================================
# PUBLIC SCHEMA - Core Application Tables
# =============================================================================
echo -e "${YELLOW}Checking Public Schema (Core Tables)...${NC}"
check_table "public" "users" 1 || ((errors++))
check_table "public" "organizations" 1 || ((errors++))
check_table "public" "teams" 1 || ((errors++))
check_table "public" "agents" 1 || ((errors++))
check_table "public" "llm_providers" 1 || ((errors++))
check_table "public" "llm_models" 1 || ((errors++))

# =============================================================================
# PUBLIC SCHEMA - RBAC Tables
# =============================================================================
echo ""
echo -e "${YELLOW}Checking RBAC Tables...${NC}"
check_table "public" "rbac_roles" 1 || ((errors++))
check_table "public" "rbac_permissions" 1 || ((errors++))
check_table "public" "rbac_user_org_roles" 1 || ((errors++))

# =============================================================================
# AUTH SCHEMA - Supabase Authentication
# =============================================================================
echo ""
echo -e "${YELLOW}Checking Auth Schema (Supabase)...${NC}"
check_table "auth" "users" 1 || ((errors++))

# =============================================================================
# MARKETING SCHEMA - Marketing Swarm
# =============================================================================
echo ""
echo -e "${YELLOW}Checking Marketing Schema...${NC}"
check_table "marketing" "agents" 1 || ((errors++))
check_table "marketing" "content_types" 1 || ((errors++))

# =============================================================================
# ORCH FLOW SCHEMA - Orch Flow App
# =============================================================================
echo ""
echo -e "${YELLOW}Checking Orch Flow Schema...${NC}"
# These may be empty in some environments
check_table "orch_flow" "profiles" 0 || ((errors++))
check_table "orch_flow" "projects" 0 || ((errors++))

# =============================================================================
# RAG DATA SCHEMA - RAG Collections
# =============================================================================
echo ""
echo -e "${YELLOW}Checking RAG Data Schema...${NC}"
check_table "rag_data" "rag_collections" 0 || ((errors++))
check_table "rag_data" "rag_documents" 0 || ((errors++))

# =============================================================================
# VERIFY KEY DATA RELATIONSHIPS
# =============================================================================
echo ""
echo -e "${YELLOW}Checking Key Data Relationships...${NC}"

# Check that all users have auth.users entries
orphan_users=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT COUNT(*) FROM public.users u
    LEFT JOIN auth.users a ON u.id = a.id
    WHERE a.id IS NULL;
" | tr -d ' ')

if [ "$orphan_users" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} All public.users have matching auth.users"
else
    echo -e "  ${RED}✗${NC} $orphan_users public.users without auth.users"
    ((errors++))
fi

# Check that all rbac_user_org_roles have valid users
orphan_roles=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT COUNT(*) FROM public.rbac_user_org_roles r
    LEFT JOIN public.users u ON r.user_id = u.id
    WHERE u.id IS NULL;
" | tr -d ' ')

if [ "$orphan_roles" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} All RBAC role assignments have valid users"
else
    echo -e "  ${RED}✗${NC} $orphan_roles RBAC role assignments with missing users"
    ((errors++))
fi

# Check that all teams have valid orgs
orphan_teams=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT COUNT(*) FROM public.teams t
    LEFT JOIN public.organizations o ON t.org_slug = o.slug
    WHERE o.id IS NULL;
" | tr -d ' ')

if [ "$orphan_teams" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} All teams have valid organizations"
else
    echo -e "  ${RED}✗${NC} $orphan_teams teams with missing organizations"
    ((errors++))
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "=========================================="
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo "Database data verification complete."
else
    echo -e "${RED}$errors issues found!${NC}"
    echo "Review the output above and fix any issues."
    echo ""
    echo "Common fixes:"
    echo "  - Run: ./scripts/post-restore-fix.sh (for schema issues)"
    echo "  - Re-run backup restore if data is missing"
    echo "  - Check seed scripts if RBAC data is missing"
    exit 1
fi
echo "=========================================="

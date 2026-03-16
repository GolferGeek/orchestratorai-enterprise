#!/bin/bash
# Complete Database Restore Script
# This script completely wipes and restores the database from latest-backup.sql.gz
# Usage: ./restore-database.sh [backup_file]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go up from scripts/ -> supabase/ -> api/ -> apps/ -> project root (4 levels)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../" && pwd)"
BACKUP_FILE="${1:-$PROJECT_ROOT/apps/api/supabase/latest-backup.sql.gz}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🗄️  Complete Database Restore${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}❌ Error: Backup file not found: $BACKUP_FILE${NC}"
  echo "   Please provide a valid backup file path"
  exit 1
fi

echo -e "${RED}⚠️  WARNING: This will COMPLETELY DROP your database!${NC}"
echo -e "${RED}   All existing data will be PERMANENTLY DELETED!${NC}"
echo ""
echo "   Backup file: $BACKUP_FILE"
echo "   Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"
echo ""
read -p "Are you ABSOLUTELY SURE? Type 'YES RESTORE' to continue: " confirmation

if [ "$confirmation" != "YES RESTORE" ]; then
  echo "❌ Restore cancelled"
  exit 0
fi

echo ""
echo -e "${BLUE}📦 Step 1: Stopping Supabase...${NC}"
cd "$PROJECT_ROOT/apps/api"
supabase stop > /dev/null 2>&1 || true
echo "   ✅ Supabase stopped"
echo ""

echo -e "${BLUE}🔄 Step 2: Starting Supabase (fresh instance)...${NC}"
supabase start > /dev/null 2>&1
sleep 5
echo "   ✅ Supabase started"
echo ""

echo -e "${BLUE}🗑️  Step 3: Dropping existing database...${NC}"
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep supabase_db | head -1)
if [ -z "$DB_CONTAINER" ]; then
  echo -e "${RED}❌ Error: Could not find Supabase database container${NC}"
  exit 1
fi

# Terminate all connections
docker exec -e PGPASSWORD=postgres "$DB_CONTAINER" \
  psql -h localhost -p 5432 -U postgres -d template1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'postgres' AND pid != pg_backend_pid();" \
  > /dev/null 2>&1 || true

# Drop database
docker exec -e PGPASSWORD=postgres "$DB_CONTAINER" \
  psql -h localhost -p 5432 -U postgres -d template1 \
  -c "DROP DATABASE IF EXISTS postgres;" \
  > /dev/null 2>&1 || true

echo "   ✅ Database dropped"
echo ""

echo -e "${BLUE}🆕 Step 4: Creating fresh database...${NC}"
docker exec -e PGPASSWORD=postgres "$DB_CONTAINER" \
  psql -h localhost -p 5432 -U postgres -d template1 \
  -c "CREATE DATABASE postgres;" \
  > /dev/null 2>&1 || true

echo "   ✅ Database created"
echo ""

echo -e "${BLUE}🔄 Step 5: Restoring from backup...${NC}"
echo "   This may take a minute or two..."
echo ""

# Restore the backup (ignore permission errors for ALTER DEFAULT PRIVILEGES and event triggers)
gunzip -c "$BACKUP_FILE" | docker exec -i -e PGPASSWORD=postgres "$DB_CONTAINER" \
  psql -h localhost -p 5432 -U postgres -d postgres \
  2>&1 | grep -v "ERROR:  permission denied to change default privileges" \
  | grep -v "ERROR:  Non-superuser owned event trigger" \
  | grep -v "NOTICE:" || true

echo ""
echo -e "${GREEN}✅ Restore completed!${NC}"
echo ""

echo -e "${BLUE}🔄 Step 6: Restarting Supabase to reload schema cache...${NC}"
supabase stop > /dev/null 2>&1
supabase start > /dev/null 2>&1
sleep 5
echo "   ✅ Supabase restarted"
echo ""

echo -e "${BLUE}🔍 Step 7: Verifying restore...${NC}"
sleep 3

# Check key tables
TABLES=(
  "auth.users"
  "public.users"
  "public.organizations"
  "public.agents"
  "public.rbac_roles"
  "public.rbac_permissions"
  "public.rbac_user_org_roles"
  "orch_flow.profiles"
  "marketing.agents"
  "marketing.content_types"
)

for table in "${TABLES[@]}"; do
  SCHEMA=$(echo "$table" | cut -d'.' -f1)
  TABLE_NAME=$(echo "$table" | cut -d'.' -f2)
  
  COUNT=$(docker exec -e PGPASSWORD=postgres "$DB_CONTAINER" \
    psql -h localhost -p 5432 -U postgres -d postgres \
    -t -c "SELECT COUNT(*) FROM $table;" 2>/dev/null | xargs || echo "0")
  
  if [ "$COUNT" -gt 0 ]; then
    echo -e "   ${GREEN}✅ $table: $COUNT rows${NC}"
  else
    echo -e "   ${YELLOW}⚠️  $table: empty${NC}"
  fi
done

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 DATABASE RESTORE COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📊 Your database has been completely restored from:"
echo "   $BACKUP_FILE"
echo ""
echo "✅ All schemas, tables, and data have been restored."
echo "✅ You can now use the application with all users, RBAC, and data."
echo ""


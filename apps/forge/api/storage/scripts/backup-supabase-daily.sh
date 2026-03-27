#!/bin/bash

# Supabase Database Backup Script
# Creates a compressed backup of the Supabase database

set -e

# Configuration
DB_HOST="127.0.0.1"
DB_PORT="54322"
DB_USER="postgres"
DB_NAME="postgres"
DB_PASSWORD="postgres"
BACKUP_DIR="storage/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/golfergeek_supabase_backup_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "🔄 Starting Supabase database backup..."
echo "📦 Backup file: ${BACKUP_FILE}"

# Start time
START_TIME=$(date +%s)

# Create backup using pg_dump from Docker (matches server version)
docker exec supabase_db_orchestratorai-enterprise pg_dump \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --clean \
  --if-exists \
  --format=plain \
  | gzip > "${BACKUP_FILE}"

# End time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Get file size
FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)

echo "✅ Backup completed successfully!"
echo "📊 Details:"
echo "   - Size: ${FILESIZE}"
echo "   - Duration: ${DURATION} seconds"
echo "   - Location: ${BACKUP_FILE}"

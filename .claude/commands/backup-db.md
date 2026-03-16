---
description: "Create a full backup of the Supabase database(s) with timestamped directory"
argument-hint: "[product] [--prod] [--no-transient] [--no-org-data]"
category: "database"
uses-skills: []
uses-agents: []
related-commands: ["restore-db"]
---

# Backup Database

Create a backup of the Supabase database. The backup is stored in `storage/backups/{timestamp}/` directory.

**Usage:** `/backup-db [product] [options]`

**Arguments:**
- `product` (optional): Which product database to back up
  - `auth` - Auth API database
  - `forge` - Forge API database
  - `compose` - Compose API database
  - `flow` - Flow API database
  - `all` - All product databases (default)

**Options:**
- `--prod` - Production mode (essential data only, excludes transient + org data)
- `--no-transient` - Exclude transient data (conversations, tasks, checkpoints)
- `--no-org-data` - Exclude org-specific data
- `--no-auth` - Exclude auth schema
- `--no-storage` - Exclude storage schema

**Examples:**
- `/backup-db` - Full backup of all databases (default)
- `/backup-db auth` - Back up Auth API database only
- `/backup-db --prod` - Production backup (essential data only)
- `/backup-db flow --no-transient` - Flow database, exclude transient data

## Data Categories

| Category | Contents | Default | Prod Mode |
|----------|----------|---------|-----------|
| **Core** | RBAC, agents, RAG, runners | Yes | Yes |
| **Auth** | auth.users, auth.identities | Yes | Yes |
| **Storage** | storage.* | Yes | Yes |
| **Org Data** | Org-specific records | Yes | No |
| **Transient** | conversations, tasks, plans, checkpoints, llm_usage | Yes | No |

## What This Does

1. **Creates timestamped backup directory:**
   - Creates `storage/backups/{YYYYMMDD_HHMMSS}/` directory

2. **Creates database backup:**
   - Uses `pg_dump` via Docker to export database
   - Exports critical tables as CSV for FK-safe restore
   - Compresses the backup with gzip

3. **Saves restore scripts:**
   - Creates `restore.sh` (quick restore)
   - Copies `restore-full.sh` (full restore)

4. **Creates metadata file:**
   - Records what was included/excluded
   - Saves row counts for verification

## Process

### Execute Backup Script

Run the v2 backup script with any provided options:

```bash
bash storage/scripts/backup-db-v2.sh [options]
```

### Output Summary

```
Database Backup Created Successfully

Backup Location:
   storage/backups/20260314_100000/

Backup Contents:
   backup.sql.gz (database dump)
   data/*.csv (critical tables)
   restore.sh (quick restore)
   restore-full.sh (full restore)
   metadata.json (backup info)
   row_counts.json (verification)

Backup Details:
   Size: 39M (compressed)
   Duration: 7 seconds
   Mode: production / full

Created: 2026-03-14 10:00:00
```

## Backup Script Location

- Main script: `storage/scripts/backup-db-v2.sh`
- After backup, restore scripts are in: `storage/backups/{timestamp}/`

## Related

- `/restore-db` - Restore from latest backup

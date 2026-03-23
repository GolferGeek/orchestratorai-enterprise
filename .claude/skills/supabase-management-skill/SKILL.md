---
name: supabase-management-skill
description: Manage Supabase database using OrchestratorAI Enterprise's storage-based sync system. Use when working with Supabase, database snapshots, migrations, agent exports, backups, or storage scripts. CRITICAL: Prevents direct Supabase operations - all operations MUST use storage/scripts/*.sh
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Supabase Management Skill

**CRITICAL ENFORCEMENT**: This skill prevents direct Supabase CLI operations. ALL database operations MUST go through the storage-based sync system using `storage/scripts/*.sh` scripts.

## When to Use This Skill

Use this skill when the user wants to:
- **Export or apply database snapshots** (for team distribution)
- **Manage agents** (export/import individual or all agents)
- **Create or apply migrations** (proposal workflow)
- **Backup or restore databases** (daily backup system)
- **Sync agents** between storage and database

**DO NOT use this skill when:**
- User wants to use Supabase CLI directly (REDIRECT to storage scripts)
- User wants to bypass the storage system (BLOCK and explain why)

## Architecture

### Core Principle: Storage-Based Sync

**NEVER use Supabase CLI directly.** All operations must use `storage/scripts/*.sh` to maintain synchronization across team members and production.

### Database Connection Details
- **Host**: `127.0.0.1` (or `localhost`)
- **Postgres port**: `54322` (direct SQL; Supabase CLI default)
- **REST / Kong (SUPABASE_URL)**: `http://127.0.0.1:54321`
- **User**: `postgres`
- **Database**: `postgres`
- **Password**: `postgres` (via `PGPASSWORD` environment variable)

### Directory Structure
```
storage/
├── backups/                          # Daily compressed backups
├── snapshots/
│   ├── agents/                       # Individual agent JSON files (SOURCE OF TRUTH)
│   ├── latest/                       # Latest full snapshot
│   └── <timestamp>/                  # Timestamped snapshots
├── migrations/
│   ├── proposed/                     # Proposed migrations
│   └── applied/                      # Applied migrations
└── scripts/                          # ALL management scripts (USE THESE ONLY)
```

## Core Operations

### 1. Database Snapshots

**Export Snapshot:**
```bash
npm run db:export-snapshot
# OR
bash storage/scripts/export-snapshot.sh
```

**Apply Snapshot:**
```bash
npm run db:apply-snapshot
# OR
bash storage/scripts/apply-snapshot.sh storage/snapshots/latest/
```

**WARNING**: Applying a snapshot will DELETE all data and replace with snapshot data.

### 2. Agent Management

**Export Single Agent:**
```bash
npm run db:export-agent <agent-name>
```

**Import Single Agent:**
```bash
npm run db:import-agent <path-to-json>
```

**Export ALL Agents:**
```bash
npm run db:export-all-agents
```

**Import ALL Agents:**
```bash
npm run db:import-all-agents
```

**Sync Agents (Delete Missing, Upsert Existing):**
```bash
npm run db:sync-agents
```

### 3. Migrations

**Proposed Migrations**: `storage/migrations/proposed/`
**Applied Migrations**: `storage/migrations/applied/`

**Proposing a Migration:**
1. Create migration file: `storage/migrations/proposed/YYYYMMDD-HHMM-description.sql`
2. Write SQL migration
3. Share for review

**Reviewing & Applying:**
1. Review proposed migration
2. Move to applied: `mv storage/migrations/proposed/<file>.sql storage/migrations/applied/`
3. Apply: `bash storage/scripts/apply-proposed-migration.sh storage/migrations/applied/<file>.sql`
4. Export new snapshot: `npm run db:export-snapshot`

### 4. Backups

**Backup Database:**
```bash
./storage/scripts/backup-supabase-daily.sh
```

**Restore from Backup:**
```bash
./storage/scripts/restore-from-backup.sh supabase <backup-file.sql.gz>
```

## Enforcement: Preventing Direct Supabase Operations

**CRITICAL**: If user attempts direct Supabase CLI operations, you MUST:

1. **STOP** the operation immediately
2. **EXPLAIN** why direct operations are forbidden:
   - Breaks storage-based sync system
   - Causes database synchronization issues across team
   - Bypasses source of truth (storage/snapshots/)
3. **REDIRECT** to appropriate storage script

**Example Error Response:**
```
ERROR: Direct Supabase operations are forbidden in OrchestratorAI Enterprise.

All database operations MUST use the storage-based sync system.

Instead of: supabase db reset
Use: npm run db:apply-snapshot
```

## Common Workflows

### After Making Database Changes
```bash
# 1. Export full snapshot
npm run db:export-snapshot

# 2. Export all agents
npm run db:export-all-agents
```

### Getting Latest Database State
```bash
# Apply full snapshot
npm run db:apply-snapshot
```

### Manual Backup Before Major Changes
```bash
./storage/scripts/backup-supabase-daily.sh
```

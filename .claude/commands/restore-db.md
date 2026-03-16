---
description: "Restore Supabase database from the latest backup (or a specified backup directory)"
argument-hint: "[backup-directory] - Defaults to latest backup in storage/backups/"
category: "database"
uses-skills: []
uses-agents: []
related-commands: ["backup-db"]
---

# Restore Database

Restore the Supabase database from the latest backup. Finds the most recent backup by timestamp and restores it with proper FK ordering.

**Usage:** `/restore-db [backup-directory]`

**Examples:**
- `/restore-db` - Restore from latest backup
- `/restore-db storage/backups/20260314_100000/` - Restore from specific backup

## What This Does

1. **Finds latest backup:**
   - Scans `storage/backups/` directory
   - Identifies backup with latest timestamp (or uses specified directory)
   - Reads metadata to understand what was included

2. **Restores database:**
   - Restores main database structure
   - Restores auth data (users, identities)
   - Restores data in FK dependency order
   - Fixes schema permissions
   - Refreshes PostgREST schema cache

3. **Verifies restoration:**
   - Checks key tables for data
   - Reports any tables with 0 rows
   - Shows verification summary

## Restore Order (FK Dependencies)

The v2 restore script handles foreign key dependencies properly:

**Essential (always restored):**
1. Organizations → RBAC roles → user-org roles
2. Agents → conversations → tasks
3. Auth users → identities

**Product-Specific:**
- Flow: `orch_flow.teams` → `orch_flow.tasks` → `orch_flow.sprints`
- Forge: agents, LangGraph checkpoints
- Compose: runners, runner configurations

**Transient (if included in backup):**
- Conversations, tasks, plans, deliverables
- Checkpoints, observability events, llm_usage

## Process

### Execute Restore Script

Run the v2 restore script:

```bash
bash storage/scripts/restore-db-v2.sh [backup-directory]
```

### Output Summary

```
Database Restored Successfully

Restored From:
   storage/backups/20260314_100000/

Backup Metadata:
   transient=false, org_data=false, prod_mode=true

Verification:
   auth.users: 4
   public.organizations: 3
   public.agents: 12
   orch_flow.teams: 8

Restored: 2026-03-14 10:05:00

IMPORTANT: Restart your API servers to reconnect to the database.
```

## Restore Script Location

- Main script: `storage/scripts/restore-db-v2.sh`
- Each backup also contains: `restore.sh` (quick restore) and `restore-full.sh`

## Safety Warnings

WARNING: Restoring a database will:
- Overwrite existing data in the database
- Drop and recreate database objects
- Potentially cause data loss if backup is older than current data

**Before restoring:**
- Ensure you have a current backup of any new data (run `/backup-db` first)
- Verify you're restoring to the correct environment
- Confirm the backup timestamp is correct

## Related

- `/backup-db` - Create a new backup before restoring
- `/backup-db --prod` - Create production backup

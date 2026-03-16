# Database Restore Guide

## Quick Restore (For Interns)

To completely restore the database from the latest backup:

```bash
cd apps/api/supabase/scripts
./restore-database.sh
```

When prompted, type: `YES RESTORE`

**IMPORTANT: After restore, run the post-restore fix!**
```bash
./post-restore-fix.sh
./verify-data.sh
```

That's it! The restore script will:
1. Stop Supabase
2. Drop the entire database
3. Restore from `latest-backup.sql.gz`
4. Restart Supabase
5. Verify all data is restored

## What Gets Restored

The restore includes **EVERYTHING**:
- ✅ All `auth.users` (Supabase authentication users)
- ✅ All `public.users` (application user profiles)
- ✅ All `public.organizations`
- ✅ All `public.agents`
- ✅ All RBAC data (`rbac_roles`, `rbac_permissions`, `rbac_user_org_roles`)
- ✅ All `orch_flow` schema data (profiles, projects, tasks, etc.)
- ✅ All `marketing` schema data (agents, content types, etc.)
- ✅ All schemas, tables, functions, triggers, and policies

## Using a Different Backup File

```bash
./restore-database.sh /path/to/your/backup.sql.gz
```

## Troubleshooting

**If restore fails:**
1. Make sure Supabase is installed: `supabase --version`
2. Make sure Docker is running: `docker ps`
3. Check the backup file exists: `ls -lh latest-backup.sql.gz`

**If you see permission errors:**
- These are normal (ALTER DEFAULT PRIVILEGES and event triggers)
- The restore still completes successfully
- Ignore these errors

## Manual Restore (If Script Fails)

If the script doesn't work, you can restore manually:

```bash
cd apps/api
supabase stop
supabase start
sleep 5

# Get container name
CONTAINER=$(docker ps --format '{{.Names}}' | grep supabase_db | head -1)

# Drop and recreate database
docker exec -e PGPASSWORD=postgres "$CONTAINER" \
  psql -h localhost -p 5432 -U postgres -d template1 \
  -c "DROP DATABASE IF EXISTS postgres; CREATE DATABASE postgres;"

# Restore backup
gunzip -c apps/api/supabase/latest-backup.sql.gz | \
  docker exec -i -e PGPASSWORD=postgres "$CONTAINER" \
  psql -h localhost -p 5432 -U postgres -d postgres

# Restart Supabase
supabase stop
supabase start
```

## Post-Restore Schema Fix (IMPORTANT!)

After restoring from backup, **always run the post-restore fix script** to ensure all required columns exist:

```bash
cd apps/api/supabase/scripts
./post-restore-fix.sh
```

This script applies a migration that adds any missing columns that may not exist in older backups. Without this, you may see errors like:
- `column pseudonym_dictionaries.data_type does not exist`
- `column cidafm_commands.is_builtin does not exist`
- `column assets.bucket does not exist`

## Data Verification Checklist

After restore, verify these critical tables have data:

### Public Schema
| Table | Purpose | Critical |
|-------|---------|----------|
| `users` | Application user profiles | ✅ |
| `organizations` | Org/tenant data | ✅ |
| `teams` | Team membership | ✅ |
| `agents` | Agent definitions | ✅ |
| `llm_providers` | LLM provider configs | ✅ |
| `llm_models` | Available LLM models | ✅ |
| `rbac_roles` | Role definitions | ✅ |
| `rbac_permissions` | Permission definitions | ✅ |
| `rbac_user_org_roles` | User role assignments | ✅ |

### Auth Schema (Supabase)
| Table | Purpose | Critical |
|-------|---------|----------|
| `auth.users` | Authentication users | ✅ |

### Marketing Schema
| Table | Purpose | Critical |
|-------|---------|----------|
| `marketing.agents` | Marketing swarm agents | ✅ |
| `marketing.content_types` | Content type definitions | ✅ |

### Orch Flow Schema
| Table | Purpose | Critical |
|-------|---------|----------|
| `orch_flow.profiles` | User profiles | ✅ |
| `orch_flow.projects` | Project data | ✅ |

### RAG Data Schema
| Table | Purpose | Critical |
|-------|---------|----------|
| `rag_data.rag_collections` | RAG collection definitions | ✅ |
| `rag_data.rag_documents` | Indexed documents | ✅ |

### Quick Verification Command

Run this after restore to check all critical tables:

```bash
cd apps/api
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -c "
SELECT 'public.users' as table_name, COUNT(*) as rows FROM public.users
UNION ALL SELECT 'public.organizations', COUNT(*) FROM public.organizations
UNION ALL SELECT 'public.teams', COUNT(*) FROM public.teams
UNION ALL SELECT 'public.agents', COUNT(*) FROM public.agents
UNION ALL SELECT 'public.llm_providers', COUNT(*) FROM public.llm_providers
UNION ALL SELECT 'public.llm_models', COUNT(*) FROM public.llm_models
UNION ALL SELECT 'public.rbac_roles', COUNT(*) FROM public.rbac_roles
UNION ALL SELECT 'public.rbac_permissions', COUNT(*) FROM public.rbac_permissions
UNION ALL SELECT 'public.rbac_user_org_roles', COUNT(*) FROM public.rbac_user_org_roles
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users
UNION ALL SELECT 'marketing.agents', COUNT(*) FROM marketing.agents
UNION ALL SELECT 'marketing.content_types', COUNT(*) FROM marketing.content_types
UNION ALL SELECT 'rag_data.rag_collections', COUNT(*) FROM rag_data.rag_collections
ORDER BY table_name;
"
```

## Notes

- **This is a COMPLETE restore** - everything in the database is replaced
- The backup file is: `apps/api/supabase/latest-backup.sql.gz`
- Always verify the restore worked by checking the row counts at the end
- If `rbac_user_org_roles` shows 0 rows, you may need to run seed scripts
- **Always run `./scripts/post-restore-fix.sh` after restore!**


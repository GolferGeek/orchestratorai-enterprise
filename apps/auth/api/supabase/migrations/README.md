# Migrations Directory

## ⚠️ Important: We No Longer Use Incremental Migrations

This project has moved to a **snapshot-based database management system** instead of incremental migrations.

### Why We Changed

The old migration system caused problems:
- ❌ People checking in old migrations that stomped newer ones
- ❌ Migration order conflicts between team members
- ❌ Difficult to coordinate database state across the team
- ❌ Git conflicts on migration files

### New System: Storage Snapshots

Instead of migrations, we now use:

1. **Full Database Snapshots** - `storage/snapshots/latest/schema.sql`
2. **Seed Data** - `storage/snapshots/latest/seed.sql`
3. **Individual Agent/Workflow Files** - `storage/snapshots/agents/` and `storage/snapshots/n8n/`

## 🚀 How To Get Started

### For Everyone (Including Interns)

```bash
# Get the latest database state
npm run db:apply-snapshot

# This will:
# 1. Drop and recreate all schemas (public, n8n, company, observability)
# 2. Apply the complete schema structure
# 3. Load seed data (agents, providers, models)
```

### When You Make Database Changes

```bash
# Export a new snapshot
npm run db:export-snapshot

# Share storage/snapshots/latest/ with the team
# (via Dropbox, Google Drive, USB, etc.)
```

## 📁 Where Everything Is Now

```
storage/
├── snapshots/
│   ├── latest/              # Current database state (SHARE THIS)
│   │   ├── schema.sql       # Complete schema (all 4 schemas)
│   │   ├── seed.sql         # Seed data (agents, providers, models)
│   │   └── metadata.json    # Snapshot info
│   ├── agents/              # Individual agent JSON files
│   └── n8n/                 # Individual N8N workflow JSON files
└── scripts/                 # All management scripts
    └── README.md            # Full documentation
```

## 📖 Full Documentation

See [storage/scripts/README.md](../../../../storage/scripts/README.md) for:
- Complete command reference
- Agent management
- N8N workflow management
- Backup/restore procedures
- Common workflows

## 🔄 What About Supabase CLI?

The Supabase CLI commands still work but use the snapshot system:

```bash
# These are now handled by our snapshot system:
supabase db reset    # ❌ Don't use - use: npm run db:apply-snapshot
supabase db push     # ❌ Don't use - migrations no longer tracked
supabase db pull     # ❌ Don't use - export snapshot instead
```

## 🆘 Need Help?

1. Read [storage/scripts/README.md](../../../../storage/scripts/README.md)
2. Run `npm run db:apply-snapshot` to get latest database
3. Ask the lead developer for the latest `storage/snapshots/` directory

## History Note

Previous migration files have been removed as they are superseded by the snapshot in `storage/snapshots/latest/schema.sql` which contains the complete, current database schema.

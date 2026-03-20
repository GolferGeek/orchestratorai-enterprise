# Supabase Backups

## Baseline (tracked in git)

The `baseline-*.sql.gz` file is a full database snapshot that ships with the repo. Use it to get a working database after cloning.

### Restore

```bash
# Ensure Supabase is running
supabase start

# Restore the baseline
gunzip -c supabase/backups/baseline-*.sql.gz | \
  docker exec -i supabase_db_supabase psql -U postgres -d postgres
```

### Create a new baseline

```bash
docker exec supabase_db_supabase pg_dump \
  -U postgres -d postgres \
  --clean --if-exists --no-owner --no-privileges | \
  gzip > supabase/backups/baseline-$(date +%Y%m%d_%H%M%S).sql.gz
```

## Archive (gitignored)

Historical backups go in `archive/`. These are not tracked in git.

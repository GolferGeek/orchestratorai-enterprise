# Baseline

The database schema and reference data every new environment starts from.

| File | What it is |
|---|---|
| `schema.sql` | Every app schema of the Studio (not Supabase's own), with owners, grants, policies, the `vector` extension and the realtime publication's tables |
| `seed.sql` | Reference data: RBAC, organizations, LLM providers and models, agents, workflow registry, agent definitions and model profiles, risk dimensions, ambient triggers, swarm configuration, demo purchase orders. The table list is `scripts/baseline/seed-tables.txt` |
| `CUTOFF` | The newest migration the baseline already contains |

- **Build a new database:** `scripts/baseline/bootstrap.sh` loads the baseline,
  the demo and admin login personas, then every migration after `CUTOFF`, and
  records them all in `public.deployment_migrations`. After that,
  `scripts/migrate-deployed.sh` carries on as usual. It refuses an empty ledger,
  because an empty ledger is a database that needs the bootstrap.
- **Catch drift:** `scripts/baseline/check-drift.sh` builds a scratch database
  that way and compares every schema object with the live one. Every deploy
  runs it, so a change made by hand, or a migration that didn't run, stops the
  deploy.
- **Fold migrations in:** `scripts/baseline/generate.sh` rewrites all three
  files from the live database. The migrations stay in `supabase/migrations`,
  and those up to `CUTOFF` are recorded as covered by the baseline.

This baseline is for Supabase environments like the Studio. The GCP / Cloud
SQL path still uses `infra/gcp/database/` (the July baseline), which has
diverged. See the effort `gcp-cloud-sql-lineage`.

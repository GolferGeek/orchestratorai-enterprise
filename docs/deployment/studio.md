# Mac Studio deployment (enterprise.orchestratorai.io)

The live demo runs on the Mac Studio: the API, web app and nginx in Docker,
Supabase's Postgres on port 6011, and a native cloudflared tunnel from
https://enterprise.orchestratorai.io to nginx on :7777.

## Quickstart

```bash
npm run deploy:studio        # = scripts/deploy-studio.sh
```

In order, it:

1. Refuses a dirty working tree, then pulls main (`--no-pull` deploys the
   tree as-is).
2. Applies pending migrations with `scripts/migrate-deployed.sh`, then
   `scripts/baseline/check-drift.sh`: the live schema must be exactly
   baseline plus migrations (see `supabase/baseline/README.md`).
3. Runs every test suite with `scripts/test-all.sh` (`npm run test:all`).
   Any failed or skipped test stops the deploy.
4. Builds the API and web images and boot-probes the new API image before
   replacing the running one.
5. Checks `https://enterprise.orchestratorai.io/api/health` through
   Cloudflare.
6. Runs the observability smoke (`scripts/smoke-observability.sh`).

## Migrations

- **Apply them with `scripts/migrate-deployed.sh`**, never
  `supabase migration up`. The Supabase CLI targets port 54322, a database
  the site doesn't read. `migrate-deployed.sh` resolves the database the
  deployed API actually reads (6011) from the compose files.
- `--dry-run` lists what's pending.
- Applied migrations are recorded in `public.deployment_migrations`, keyed
  by the version prefix. Two files with the same prefix collide: the second
  is treated as applied and silently skipped. Give every migration a unique
  version.
- Migrations run as `supabase_admin`. **Every new table, schema or sequence
  needs `OWNER TO postgres`**, the role the API connects as, or the API gets
  "permission denied".
- On its first run the ledger adopted 33 older migrations without running
  them, and several never ran on the Studio (repaired by `20260928131500` and
  `20260928160000`). An empty ledger now refuses: a new database is built with
  `scripts/baseline/bootstrap.sh`, and the drift check keeps the Studio and
  the repository identical.

## Tests

`npm run test:all` runs apps/api, packages/planes, transport-types and
apps/web against the local Postgres (`TEST_DATABASE_URL`, default
`postgresql://postgres:postgres@127.0.0.1:6011/postgres`). It sets every
database spec's variable and fails on any skip.

## Secrets

- Secrets live in `.env.secrets` (gitignored), which compose loads.
- `GATEHOUSE_SIGNING_KEY` is the ES256 private JWK that signs outbound A2A
  calls. Its public half is served at `/api/gatehouse/jwks.json`.

## Several sessions, one repo

- Don't leave work in progress in the main checkout: a dirty tree blocks
  every deploy. Work in a worktree
  (`git worktree add ../orchestratorai-enterprise-<topic> -b <branch>`),
  then merge to main.
- Deploy only from the main checkout. Compose bind-mounts
  `./docker/nginx-gateway.conf` from the directory the deploy runs in.

## Issues we hit — and where each fix lives

| # | Symptom | Root cause | Fix location | Reference |
|---|---------|-----------|--------------|-----------|
| 1 | Migrations "applied" but the site never saw them | `supabase migration up` targets port 54322 | script | `scripts/migrate-deployed.sh` |
| 2 | A table exists, but the API gets "permission denied" | Created by `supabase_admin` | every migration: `OWNER TO postgres` | `scripts/migrate-deployed.sh` notes |
| 3 | `/pipelines` failed on every call | Migration adopted by the ledger but never run | migration | `20260928131500_agent_pipelines_never_ran.sql` |
| 4 | Web image `npm ci`: "Missing: uuid@11.1.1" | Direct deps declared uuid ^11 against the root override uuid 14; npm 10 (image) and 11 (local) disagree | package.json | `f77ee7d6` |
| 5 | A red suite was deployed | Commit and deploy were chained without stopping on failure | deploy script | `scripts/test-all.sh`, `7db58527` |
| 6 | Web tests fail locally on Node 25+ (`localStorage.clear` undefined) | Node's global `localStorage` shadows jsdom's | vite config | `execArgv: ['--no-experimental-webstorage']` |
| 7 | Migrations recorded as applied that never ran | The ledger "adopted" every file on its first run | baseline + bootstrap + drift check | `supabase/baseline/`, `scripts/baseline/` |

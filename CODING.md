# CODING — orchestratorai-enterprise

Orientation brief for Coding Manager handoffs and Claude Code (`claude -p`).

**Strong CLAUDE.md / AGENTS.md already exist — point at them; do not duplicate.**

## Purpose
OrchestratorAI Enterprise unified platform (NestJS API + Vue web, provider planes, transport-types, local Supabase). Customer-controlled / white-label platform; MIT.

## In scope
- `apps/api` (platform API), `apps/web` (Vue shell + modules)
- Shared `packages/transport-types`, `packages/planes`, `packages/ui`
- Local Supabase, Lightning profile services when used
- Demo|Admin login from env (demo-user@orchestratorai.io / DemoUser123!, admin-user@orchestratorai.io / AdminUser123!)

## Out of scope
- Local Legal appliance → `~/projects/orchestratorai/orchestratorai-local`
- Governance product → `orchestratorai-governance`
- Offering/curriculum/marketing sites → `orchestratorai-offering`, `orchestratorai-curriculum`
- Apple/Pi labs → `orchestratorai-apple`, `orchestratorai-pi`

## Hard rules
- Mac Studio only for coding
- Commit and push to `main` (no PRs / no feature branches unless asked)
- Never commit secrets (`.env`, `.env.secrets`, `recovery/`)
- No fallbacks / no cheating — see CLAUDE.md absolute rules
- ExecutionContext + transport-types are sacred; products contain zero infrastructure dirs (see CLAUDE.md)

## Verify done
- Local: API `:6700`, web `:6701`; Supabase REST/DB per current README (verify on disk)
- Public hosts when Studio up: https://enterprise.orchestratorai.io , https://app.orchestratorai.io
- `npm run lint|build|test` / `npm run dev:all` as documented

## Claude working directory
`cd /Users/golfergeek/projects/orchestratorai/orchestratorai-enterprise` then `~/.local/bin/claude -p "..."`

## Pointers
- CLAUDE.md, AGENTS.md, README.md, docs/, `.env.example`

## Deploying on the Mac Studio
Use `deploy-enterprise` (= `scripts/deploy-studio.sh` / `npm run deploy:studio`): pulls main, migrates the local
Supabase, builds the images, recreates the :7777 stack, health-checks https://enterprise.orchestratorai.io.
Do not run bare `docker compose up` here: without the cloudflare overlay files the API gets the host-side
`127.0.0.1:54322` database URL from `.env` and crashes at startup (`npm run docker:up` is now overlay-aware).

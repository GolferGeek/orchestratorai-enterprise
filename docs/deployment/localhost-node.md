# Self-hosted Node.js (localhost / Spark) deployment

> **Status: stub — but this is a first-class target, not an afterthought.** The
> platform runs as a plain Node.js application on localhost (the "Spark" box) and
> is exposed to the internet through a Cloudflare tunnel. This is how the live
> sites (`orchestratorai.io`, `legal.orchestratorai.io`, `divinr.ai`) are served
> today. Fill this in using [`_runbook-template.md`](./_runbook-template.md).

## Why this profile is *harder*, not easier

On a managed cloud, Terraform + Secret Manager + a managed Postgres quietly
perform a lot of the environment reconciliation for you. On the Spark box, none
of that exists — so every "cannot be fixed in the codebase" item from the GCP
runbook has to be performed here **by hand or by a local script**:

- App DB role `search_path` spanning all application schemas.
- LangGraph checkpoint/store table ownership.
- Seed model-config normalization to the active provider profile.
- Secret wiring (no Secret Manager — secrets come from `.env` / `.env.secrets`).

These are application assumptions about the environment and are
target-independent; the local profile just makes them fully your problem. Budget
for them up front.

## What we know today (fill in and correct as we go)

- Runs the same monolith: one API process + one web build, served locally.
- Provider profile is the local/multi-provider one (not the GCP OpenRouter
  profile) — Supabase for DB/observability, local config, etc. Confirm the exact
  selectors against the root `.env` / `.env.example`.
- Public exposure is via **Cloudflare tunnel** (credentials live only in the
  Spark box's `~/.cloudflared/cert.pem`); DNS is managed from there.
- Supabase runs locally (REST `6010`, Postgres `6011`); `DATABASE_URL` points at
  the local instance.

## What we do NOT have yet

- A captured, reproducible bring-up sequence for the Spark box.
- Local equivalents of the GCP deploy-time scripts (the DB reconciliation above).
- A validation checklist for the tunnel-exposed localhost profile.

## When we next touch the Spark deployment

1. `cp _runbook-template.md localhost-node.md` (overwrite this stub), work
   top-down, and record the actual bring-up steps and traps.
2. Port the GCP deploy-time DB reconciliation into a local script — it is the
   part most likely to bite identically here.

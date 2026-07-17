# Platform Monolith Consolidation — Completion Report

**Date**: 2026-07-16
**Branch**: `codex/ai-platform-monolith-consolidation`

## Final App Shape

The starter platform now has one deployable web frontend and one deployable API backend:

```text
apps/
  api/
  web/

packages/
  transport-types/
  planes/
  ui/
```

API modules are consolidated under `apps/api/src`:

- `auth`
- `admin`
- `agents`
- `workflows`
- `ambient`
- `secure-conversations`
- `rag`
- `health`

Web modules are consolidated under `apps/web/src`:

- `app`
- `shell`
- `modules/auth`
- `modules/admin`
- `modules/agents`
- `modules/workflows`
- `modules/ambient`
- `modules/secure-conversations`
- `modules/rag`
- `modules/settings`
- `shared`
- `testing`

## Removed Deployable Surface

The active `apps/` workspace now contains only:

- `apps/api`
- `apps/web`

The active root workspace list now contains only:

- `apps/api`
- `apps/web`
- `packages/transport-types`
- `packages/planes`
- `packages/ui`

Docker now defines `platform-api` and `platform-web` as the starter runtime. Optional Lightning services remain behind the `lightning` profile.

## Protocol Lab Disposition

Protocol Lab is not part of the starter runtime. It was classified as developer/demo-only material because the starter objective is one deployable web app and one deployable API app. Reintroducing Protocol Lab should be a separate future effort with explicit scope.

## Verification

Commands run successfully during the closing pass:

- `npm run lint -- --max-warnings=0`
- `npm run build`
- `npm test`
- `npm run test:integration:health`
- `npm run test:integration:admin -- --runInBand`
- `./scripts/dev-servers.sh status`

Runtime status:

- Supabase REST: `54321`
- Supabase Postgres: `54322`
- Platform API: `6700`
- Platform web: `6701`

Focused scans found no active starter-code references to old product deployable paths, old product dev scripts, old product ports, old standalone Auth/Admin endpoint env vars, or old product API URL build args.

## Known Residual Risks

- `npm audit --audit-level=moderate` still reports the accepted upstream Google Vertex SDK chain:
  - `@google-cloud/vertexai@1.12.0`
  - `google-auth-library@9.15.1`
  - `gaxios@6.7.1`
  - `uuid@9.0.1`
- `@google-cloud/vertexai@1.12.0` was the latest published package during verification. A scoped override to `google-auth-library@10.9.0` left npm with an invalid dependency tree and was not committed.
- The exception is documented in `docs/security/audit-exceptions.md` and checked with `npm run audit:accepted`; it should be addressed when/if a client wants Vertex AI enabled.
- Historical/archive docs still reference old products and ports as historical records. Active starter docs now describe the unified platform runtime.

## Follow-Up Recommendations

- Replace or remove the legacy `@google-cloud/vertexai` SDK path once a Vertex AI client need exists or once the current Google GenAI/Vertex media path fully covers the plane.
- Add browser automation coverage for the full module set beyond the current in-app/manual evidence and API integration gates.
- Keep future feature work in module-owned folders under `apps/api/src/*` and `apps/web/src/modules/*`; do not revive old product deployables.

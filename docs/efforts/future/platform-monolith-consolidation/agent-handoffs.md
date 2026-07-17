# Platform Monolith Consolidation — Agent Handoffs

**Last updated**: 2026-07-16

This effort was executed in one primary orchestration thread. The key handoff point is that the repo now runs as a unified starter platform, not as separate product deployables.

## Completed Slices

### Admin consolidation

- Copied Admin screens into `apps/web/src/modules/admin`.
- Copied Admin API behavior into `apps/api/src/admin` and `apps/api/src/auth` where auth-owned.
- Promoted operational screens into Settings where they are no longer Admin navigation.
- Promoted RAG management into the first-class RAG module.

### Agents consolidation

- Copied the working Compose agent list, conversation, runner, model, RAG helper, media, and customer-service behavior into `apps/api/src/agents` and `apps/web/src/modules/agents`.
- Removed workflow-owned Marketing Swarm code from Agents after Workflows owned it.
- Hid or removed non-starter/demo agents that should not ship in the starter surface.

### Workflows consolidation

- Copied Marketing Swarm into `apps/api/src/workflows` and `apps/web/src/modules/workflows`.
- Removed the copied Legal Department workflow surface from the starter runtime after user direction; no hidden legacy legal workflow routes remain active.
- Verified Marketing Swarm remains the workflow route of record.

### Ambient consolidation

- Copied Pulse behavior into `apps/api/src/ambient` and `apps/web/src/modules/ambient`.
- Reworked visible names from Pulse to Ambient.
- Hardened trigger creation, listener startup, event evaluation, and malformed trigger config handling.

### Secure Conversations consolidation

- Copied Bridge behavior into `apps/api/src/secure-conversations` and `apps/web/src/modules/secure-conversations`.
- Reworked visible names from Bridge to Secure Conversations while keeping A2A as protocol vocabulary inside the module.
- Removed old method-prefix routing branches and compatibility naming.

### Runtime cleanup

- Removed old deployable app directories from the active workspace.
- Reduced root workspaces to:
  - `apps/api`
  - `apps/web`
  - `packages/transport-types`
  - `packages/planes`
  - `packages/ui`
- Replaced Docker services with `platform-api` and `platform-web`.
- Removed old product ports from active starter code/templates.
- Normalized entitlements to current module slugs with a Supabase migration.

## Verification Summary

Most recent verified gates:

- `npm run lint -- --max-warnings=0`
- `npm run build`
- `npm test`
- `npm run test:integration:health`
- `npm run test:integration:admin -- --runInBand`
- `./scripts/dev-servers.sh status`

All passed on 2026-07-16. The local stack was healthy with Supabase `54321/54322`, API `6700`, and web `6701`.

## Handoff Notes

- Do not reintroduce old product app directories, old product ports, or fallback proxy wrappers.
- Keep `packages/transport-types` authoritative for ExecutionContext and invoke/A2A contracts.
- Keep `packages/planes` authoritative for infrastructure.
- Protocol Lab is intentionally outside the starter runtime.
- The remaining audit item is upstream in `@google-cloud/vertexai@1.12.0 -> google-auth-library@9.15.1 -> gaxios@6.7.1 -> uuid@9.0.1`. A tested npm override left the dependency tree invalid and was not committed.

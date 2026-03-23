# Integration tests (HTTP, real services)

Jest suite under `tests/integration/` hits live APIs (see `helpers/ports.ts` for base URLs). Tests run **sequentially** (`maxWorkers: 1`) because later suites reuse auth state.

## Files

| File | Focus |
|------|--------|
| `00-prerequisites.spec.ts` | Environment / prerequisites |
| `01-auth.spec.ts` | Auth API |
| `02-health.spec.ts` | `/health` across products |
| `03-forge.spec.ts` | Forge API |
| `04-compose.spec.ts` | Compose API |
| `06-admin.spec.ts` | Admin API |
| `07-pulse.spec.ts` | Pulse API |
| `08-bridge.spec.ts` | Bridge API |

Run from repo root:

```bash
npm run test:integration
```

Product-specific shortcuts: `npm run test:integration:auth`, `:health`, `:forge`, `:compose`, `:admin`, `:pulse`, `:bridge`.

Requires the corresponding dev servers (and Supabase when applicable). See root `CLAUDE.md` for ports.

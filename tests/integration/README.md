# Integration tests (HTTP, real services)

Jest suite under `tests/integration/` hits the live platform API (see `helpers/ports.ts` for base URL). Tests run **sequentially** (`maxWorkers: 1`) because later suites reuse auth state.

## Files

| File | Focus |
|------|--------|
| `00-prerequisites.spec.ts` | Environment / prerequisites |
| `01-auth.spec.ts` | Auth endpoints on the platform API |
| `02-health.spec.ts` | Platform `/health` |
| `06-admin.spec.ts` | Admin endpoints on the platform API |

Run from repo root:

```bash
npm run test:integration
```

Focused shortcuts: `npm run test:integration:auth`, `:health`, `:admin`.

Requires the platform API and Supabase. Use `npm run dev:all`.

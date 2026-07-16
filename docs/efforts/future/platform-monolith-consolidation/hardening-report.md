# Platform Monolith Consolidation — Hardening Report

**Date**: 2026-07-16
**Scope**: scan-errors / fix-errors / monitor / harden pass for the unified platform API and web apps.

## Fixed In This Pass

- Added package-local ESLint flat configs for the unified API and web apps.
- Enforced lint with `--max-warnings=0`; current lint gate passes with no warnings.
- Fixed copied RAG management schema drift by aligning collection creation to the current `complexity_type='comprehensive'` database constraint.
- Updated Admin integration coverage to use first-class `/rag/...` endpoints instead of removed `/admin/rag/...` routes.
- Removed copied database-tool `require()` usage and added the missing direct `zod` API dependency.
- Fixed web package scripts so package-local build/test commands load the same unified platform env as the root scripts.
- Split the web production bundle into stable manual chunks so Vite build no longer emits chunk-size warnings.
- Fixed test output warnings from dotenv by using quiet env loading where the package explicitly loads `.env`.
- Added missing direct dependencies that were previously only present transitively:
  - `packages/planes`: cloud provider SDKs, database/storage SDKs, extractors, provider LLM SDKs, `uuid`, and matching type packages.
  - `apps/api`: `cron`.
  - `apps/web`: `dompurify`.
- Ran `npm audit fix` without `--force`, reducing audit findings from 64 to 7 without taking breaking major upgrades.
- Fixed Turbo test-output warnings by setting no-output test tasks to `outputs: []`.

## Verification

- `npm run lint -- --max-warnings=0` — passed.
- `npm run build` — passed.
- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `npm test` — passed.
- `npm run test:integration:health` — passed.
- `npm run test:integration:admin` — passed.

## Remaining Hardening Queue

- `npm audit --audit-level=moderate` still reports 7 findings:
  - Vite/Vitest chain: `vite`, `vitest`, `vite-node`, `@vitejs/plugin-vue`, `esbuild`.
  - Google Vertex SDK chain: `gaxios`, `uuid`.
- The Vite/Vitest fix currently requires semver-major upgrades (`vite@8`, `vitest@4`, `@vitejs/plugin-vue@6`) and should be handled as a focused toolchain upgrade with browser/build verification.
- The `gaxios/uuid` issue comes through `@google-cloud/vertexai@1.12.0` -> `google-auth-library@9.15.1` -> `gaxios@6.7.1` -> `uuid@9.0.1`. Broad npm overrides created an invalid dependency tree and were removed. Fix this through a supported Vertex SDK/auth-library upgrade or provider package replacement.
- Planes tests still print expected Nest logger output from failure-path tests. These are not build/lint warnings and were not globally muted because they exercise explicit error handling.

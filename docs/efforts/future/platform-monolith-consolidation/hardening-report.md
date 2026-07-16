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
- Upgraded the unified web toolchain to `vite@8.1.5`, `vitest@4.1.10`, and `@vitejs/plugin-vue@6.0.8`.
- Added explicit `esbuild` web dev dependency and configured Vite CSS minification through esbuild so Ionic CSS no longer emits Lightning CSS pseudo-class warnings.
- Migrated the web production bundle config from deprecated `rollupOptions.manualChunks` to Vite 8 `rolldownOptions.output.codeSplitting.groups`; current web build emits no chunk-size warnings.
- Disabled Rolldown plugin timing diagnostics for the web build so root build/test output no longer emits Vite plugin timing warnings.

## Verification

- `npm run lint -- -- --max-warnings=0` — passed.
- `npm run build` — passed.
- `npm run build:api` — passed.
- `npm run build:web` — passed.
- `npm test` — passed.
- `npm run test:integration:health` — passed.
- `npm run test:integration:admin` — passed.

## Remaining Hardening Queue

- `npm audit --audit-level=moderate` still reports 2 accepted findings:
  - Google Vertex SDK chain: `gaxios`, `uuid`.
- The `gaxios/uuid` issue comes through `@google-cloud/vertexai@1.12.0` -> `google-auth-library@9.15.1` -> `gaxios@6.7.1` -> `uuid@9.0.1`.
- `@google-cloud/vertexai@1.12.0` is the latest published Vertex package version checked during this pass and still depends on `google-auth-library@^9.1.0`.
- `npm audit fix` reports the issue but does not change the tree. A scoped npm override for `gaxios -> uuid@11.1.1` was tested and removed because `npm ls` marked the dependency invalid.
- The accepted-risk gate is documented in `docs/security/audit-exceptions.md` and enforced by `npm run audit:accepted`.
- Fix the remaining audit item when/if a client wants Vertex AI enabled, through an upstream Vertex SDK/auth-library release, a supported provider package replacement, or by removing the legacy Vertex package once the newer `@google/genai` path fully covers the plane.
- Planes tests still print expected Nest logger output from failure-path tests. These are not build/lint warnings and were not globally muted because they exercise explicit error handling.

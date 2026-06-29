# Roadmap

This roadmap is intentionally high-level. The detailed planning history lives in `docs/efforts/`.

## Mature Areas

- Multi-product monorepo structure.
- Auth, RBAC, and organization management foundations.
- Shared transport contract and execution context model.
- Admin tooling for organizations, users, roles, entitlements, observability, and RAG collections.
- Forge legal workflow architecture and browser-test documentation.
- Local Supabase/Postgres-backed RAG data model and seed data.

## Active Areas

- Hardening product auth patterns around shared auth-client usage.
- Improving gateway and public demo routing for multi-product evaluation.
- Expanding legal workflow quality gates and browser verification coverage.
- Making public documentation easier for reviewers, contractors, and funders to navigate.

## Planned Areas

- More complete hosted demo guidance and screenshots.
- Lightweight CI that runs stable checks without blocking on known legacy issues.
- Additional architecture diagrams for transport, planes, auth, and workflow execution.
- More focused onboarding docs for each product area.
- Production-readiness notes for secrets, deployments, observability, and backup workflows.

## Review Notes

For contract or funding review, start with:

- `README.md` for the product and repo overview.
- `docs/architecture.md` for system boundaries.
- `docs/demo-guide.md` for a guided local walkthrough.
- `docs/efforts/` for planning depth and implementation history.

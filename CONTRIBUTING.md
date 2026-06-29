# Contributing

Thanks for taking a look at OrchestratorAI Enterprise. This repository is an active product codebase, so contributions should preserve the product boundaries and transport contracts described in the README and architecture docs.

## Local Setup

```bash
npm install
cp .env.example .env
touch .env.secrets
npm run dev:all
```

Use Node.js 20. The `.nvmrc` file is provided for `nvm` users:

```bash
nvm use
```

## Development Workflow

- Keep changes scoped to the product or package you are working on.
- Prefer the existing product structure over introducing new cross-cutting patterns.
- Keep provider-specific infrastructure behind `packages/planes`.
- Use `@orchestrator-ai/transport-types` for execution context and invocation contracts.
- Do not duplicate transport or execution-context types inside product apps.

## Checks

Run focused checks while developing:

```bash
npm run lint
npm run test
npm run build
```

Some packages also expose product-specific scripts. For example:

```bash
npm run dev:forge:api
npm run dev:forge:web
npm run test:integration
```

## Pull Requests

For pull requests, include:

- A short summary of what changed.
- The product/package touched.
- The checks you ran.
- Screenshots for visible UI changes.
- Any known limitations or follow-up work.

## Security

Do not commit real secrets, production credentials, customer data, private keys, or generated local database dumps. Put local secrets in `.env.secrets`, which is intentionally ignored by git.

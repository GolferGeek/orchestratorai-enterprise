# Azure deployment

> **Status: stub.** We have deployed to Azure before, but none of that
> knowledge was captured — so this is intentionally empty rather than wrong. The
> next Azure deployment fills it in using [`_runbook-template.md`](./_runbook-template.md)
> and the same five categories as [`google-cloud.md`](./google-cloud.md).

## What already exists in code

The Azure provider planes are implemented and selectable via configuration —
Azure is a supported target at the code level; only the deploy know-how is
missing:

- **LLM** — `packages/planes/llm/azure-foundry/` (`AZURE` / Foundry provider)
- **Config / secrets** — `packages/planes/config/azure-keyvault-config-provider.ts`
  (`CONFIG_PROVIDER=azure_keyvault`)
- **Storage** — `packages/planes/storage/azure-blob-media-storage.service.ts`
  (`STORAGE_PROVIDER=azure_blob`)
- **Auth** — Azure OIDC path in `packages/planes/auth/` (`AUTH_PROVIDER=azure_oidc`)

## What we do NOT have yet (fill on next deploy)

- Terraform/Bicep under `infra/` for Azure (no equivalent of `infra/gcp/`).
- A `.env.azure.example` provider profile.
- Bootstrap / migrate / validate / provision-admin scripts for Azure.
- The issues-and-fixes runbook. **Expect many GCP issues to recur in an
  Azure-shaped form** — especially the deploy-time database reconciliation
  (`search_path`, LangGraph table ownership, seed-data normalization). Those are
  application assumptions about the environment and are cloud-independent, so
  budget for them up front instead of rediscovering them. See the "Cannot be
  fixed in the codebase" section of the GCP runbook.

## When we deploy to Azure

1. `cp _runbook-template.md azure.md` (overwrite this stub) and work top-down.
2. Port the GCP deploy-time DB reconciliation first — it is the part most likely
   to bite identically.
3. Record every issue in the table **as you fix it**, with the fix-location
   column filled in.

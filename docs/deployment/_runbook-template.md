# {Cloud} deployment

> Copy this file to `{cloud}.md` and fill it in. Delete these quote lines.
> Keep the section order — it matches the categories in the folder README so
> every cloud reads the same way.

## Quickstart

The minimal, known-good sequence to stand up a fresh environment. Assume nothing
is deployed. Link the Terraform dir, the provider profile (`.env.{cloud}`), and
the bootstrap/validate scripts.

```bash
# provision infra, build+push images, migrate, provision admin, validate
```

## Supported provider profile

The provider selectors this cloud runs with (`DB_PROVIDER`, `LLM_PROVIDER`,
`AUTH_PROVIDER`, `STORAGE_PROVIDER`, `CONFIG_PROVIDER`, …) and why.

## Issues we hit — and where each fix lives

The table below is the heart of the runbook. One row per real issue. The
**Fix location** column is the knowledge that git history does not preserve.

| # | Symptom | Root cause | Fix location | Reference |
|---|---------|-----------|--------------|-----------|
| 1 | | | code / deploy-script / terraform / env | commit or file |

## Cannot be fixed in the codebase — must be handled at deploy

The application is correct but assumes something the environment must provide.
These will recur on **every** new instance of this cloud. Be explicit about
*why* it cannot live in code.

- **{Assumption}** — why the app depends on it, and the exact deploy-time fix
  (migration script / env var / Terraform resource).

## Fixed in Terraform / environment

Infrastructure wiring and env settings that differ from local/dev defaults.

## Scripts we added

Reusable automation. One line each: what it does, when it runs, whether it is
idempotent.

## Known architectural debt

Things we worked around rather than fixed. State the workaround, then the real
fix so a future engineer can pick it up.

## Verification checklist

The concrete post-deploy checks that prove the environment is healthy (ideally
automated in a `validate-deployment` script).

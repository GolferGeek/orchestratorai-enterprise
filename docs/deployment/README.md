# Deployment runbooks

This folder is the **living memory of how we actually deploy this platform** to
each cloud. It is deliberately not a polished manual — it is a runbook that gets
better every time we deploy and hit something new. It will never be perfect.
That is fine. The goal is that the *second* deployment to any cloud (a new
customer instance, a new environment, or the next engineer) costs a fraction of
the first, because the first one's pain is written down.

## Why this exists

Deployment knowledge is the most easily lost knowledge in a codebase. It lives
in one person's terminal history and evaporates the moment they move on. When we
deployed to Google Cloud we rediscovered the same handful of issues repeatedly;
when we go to Azure we will pay that price again unless we capture it. These
docs are the antidote.

## The one distinction that matters most

For every issue we hit, we record **where the fix lives**, because that is the
knowledge that does not survive in git history:

| Category | Meaning |
|----------|---------|
| **Fixed in code** | A real bug or gap in the application. Fixed once, benefits every deployment. Lives in git; recorded here only for context. |
| **Cannot be fixed in code — handled at deploy** | The application is *correct* but makes an assumption the environment must satisfy (DB roles, `search_path`, table ownership, seed data shaped for another profile). The fix belongs in Terraform, env vars, or a migration/bootstrap script — never in app code. **This is the highest-value column.** |
| **Fixed in Terraform / environment** | Infrastructure wiring: same-origin proxy, CPU/timeout settings, provider selectors, IAM, secrets. |
| **Scripts we added** | Reusable automation so the next deploy does not re-solve it by hand. |
| **Known architectural debt** | Things we *worked around* rather than fixed, with a note on the real fix for later. |

## Structure

- [`_runbook-template.md`](./_runbook-template.md) — copy this to start a new
  target. It already has the five headings above. New target = copy + fill.
- [`google-cloud.md`](./google-cloud.md) — **GCP: quickstart + full runbook.**
  The happy-path commands at the top, the war stories (issues, root causes, and
  where each fix lives) below.
- [`azure.md`](./azure.md) — **Azure: stub.** The provider planes exist in code
  (`azure-foundry`, `azure-keyvault`, `azure-blob`) but we have no captured
  deployment infra or lessons yet. Fill this the day we deploy.
- [`localhost-node.md`](./localhost-node.md) — **Self-hosted Node.js: stub.**
  The platform also has to run as a plain Node.js application on localhost — the
  "Spark" box, exposed to the internet via Cloudflare tunnel (this is how the
  live sites are served today). Not a managed cloud, so nothing provisions the
  environment for you: the deploy-time database reconciliation and secret wiring
  that Terraform/Secret Manager handle on GCP must be done by hand or by script
  here. Expect this to be the *harder* profile, not the easier one.

## Targets are not just clouds

A "deployment target" is any environment the platform runs in, including the
**self-hosted Node.js / localhost** profile — not only managed clouds. The
application makes the same environment assumptions everywhere (see "Cannot be
fixed in the codebase" in each runbook); managed clouds just hide more of the
reconciliation behind Terraform. On the Spark box, that work is fully exposed.

## How to use it during a deploy

1. Skim the target cloud's runbook before you start — most of the traps are
   already listed.
2. When you hit something new, add it to the right category **as you fix it**,
   not "later." Later never comes, and the detail you have in the moment is the
   detail that makes it reproducible.
3. If a fix ended up in a script or Terraform, link the file. If it *cannot* be
   fixed in code, say so explicitly and explain why — that sentence is the whole
   point of this folder.

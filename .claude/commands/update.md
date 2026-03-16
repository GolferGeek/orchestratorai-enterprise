---
description: "Daily update: Pull latest code, install dependencies, apply database migrations, and verify environment is ready for development."
category: "operations"
uses-skills: []
uses-agents: []
related-commands: ["backup-db"]
---

# /update

Update the environment for daily work.

**OBJECTIVE:** Pull latest code, update dependencies, and apply database migrations.

**DONE WHEN:** The environment is up-to-date and ready for development.

## TODO

- [ ] **Git Pull**:
    - Run `git pull` to get the latest changes.
    - Report any merge conflicts.

- [ ] **Dependencies**:
    - Run `npm install` from the repo root to ensure all packages are in sync.
    - Report any peer dependency warnings or errors.

- [ ] **Database Migration**:
    - Verify Supabase is running (check relevant product databases).
    - Apply pending migrations for each product that has them.
    - For each product with a Supabase instance:
      ```bash
      cd apps/{product}/api && supabase db push
      ```
    - Report if any migrations failed or if there were conflicts.

- [ ] **Status Check**:
    - Verify the key services can start (quick build check).
    - Report summary of what was updated.

## Products with Databases

Each product uses its own Supabase schema or instance:

| Product | Schema(s) |
|---------|-----------|
| Auth API | `public` (orgs, users, roles, entitlements) |
| Forge API | `public` (agents, conversations, tasks) |
| Compose API | `public` (runners, conversations, tasks) |
| Flow API | `orch_flow` (teams, tasks, sprints, files) |
| Ambient Pulse | `public` (events, workflows) |
| Ambient Bridge | `public` (a2a protocol records) |

## Output

After running, report:

```
Update Complete

Git:
  Branch: main
  Pulled: 3 commits (abc1234..def5678)
  Conflicts: None

Dependencies:
  npm install: Success
  New packages: 2 added, 1 updated

Migrations:
  auth/api: 2 migrations applied
  forge/api: 0 pending
  flow/api: 1 migration applied
  compose/api: 0 pending

Environment Ready
```

EXECUTE NOW: Perform the update.

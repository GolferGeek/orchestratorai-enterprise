---
description: "Run product specialization — strips a product's monolith copy down to product-specific code by launching the product agent"
argument-hint: "<product-name> (command|auth|admin|forge|compose|pulse|bridge)"
category: "enterprise"
uses-skills: []
uses-agents: ["command-product-agent", "auth-product-agent", "admin-product-agent", "forge-product-agent", "compose-product-agent", "pulse-product-agent", "bridge-product-agent"]
related-commands: ["smoke", "scan-errors"]
---

# /specialize

Run product specialization for a specific OrchestratorAI Enterprise product. This command takes a full monolith copy and strips it down to contain only what belongs to the specified product.

## Usage

```
/specialize <product-name>
```

**Product names:**
- `command` - Command (Navigation Shell)
- `auth` - Auth (Standalone Auth Service)
- `admin` - Admin (Admin Web UI)
- `forge` - Forge (Complex Agent Dashboards)
- `compose` - Compose (Simple Composable Agents)
- `pulse` - Pulse (Internal Ambient Automation)
- `bridge` - Bridge (External A2A Communication)

## Examples

```
/specialize forge
# Specializes the Forge product — strips non-agent code, enforces A2A on all agents

/specialize compose
# Specializes Compose — removes LangGraph workflows, keeps 5 runner types only

/specialize auth
# Specializes Auth — removes agent runners, keeps JWT/entitlements/org management

/specialize pulse
# Specializes Pulse — aligns SSE/observability/A2A with platform standard

/specialize bridge
# Specializes Bridge — keeps external A2A, removes internal automation
```

## What This Does

1. **Reads the product's CLAUDE.md** — the `apps/{product}/*/CLAUDE.md` files describe what to keep and what to strip.

2. **Launches the product agent** — the corresponding `{product}-product-agent` reads the CLAUDE.md guidance and performs the specialization.

3. **Strips irrelevant code** — removes modules, controllers, services, views, and components that don't belong to this product.

4. **Updates configuration** — adjusts ports in environment files and `package.json` to match the product's assigned ports.

5. **Verifies build** — runs `npm run build` to confirm the specialized product compiles cleanly.

6. **Reports results** — summarizes what was removed, what was kept, and any issues found.

## Product Agent Mapping

| Command | Agent Launched | Product Directory |
|---------|---------------|-------------------|
| `/specialize command` | `command-product-agent` | `apps/command/web/` |
| `/specialize auth` | `auth-product-agent` | `apps/auth/api/` |
| `/specialize admin` | `admin-product-agent` | `apps/admin/web/` |
| `/specialize forge` | `forge-product-agent` | `apps/forge/api/`, `apps/forge/web/` |
| `/specialize compose` | `compose-product-agent` | `apps/compose/api/`, `apps/compose/web/` |
| `/specialize pulse` | `pulse-product-agent` | `apps/ambient/pulse/` |
| `/specialize bridge` | `bridge-product-agent` | `apps/ambient/bridge/` |

## CLAUDE.md Guidance

Each product has a CLAUDE.md in its directory that the agent reads:

```
apps/command/web/CLAUDE.md         — What to keep/strip for Command
apps/auth/api/CLAUDE.md            — What to keep/strip for Auth
apps/admin/web/CLAUDE.md           — What to keep/strip for Admin
apps/forge/api/CLAUDE.md           — What to keep/strip for Forge API
apps/forge/web/CLAUDE.md           — What to keep/strip for Forge Web
apps/compose/api/CLAUDE.md         — What to keep/strip for Compose API
apps/compose/web/CLAUDE.md         — What to keep/strip for Compose Web
apps/ambient/pulse/CLAUDE.md       — What to keep/strip for Pulse
apps/ambient/bridge/CLAUDE.md      — What to keep/strip for Bridge
```

## Output

```
Specializing: forge

Reading CLAUDE.md guidance...
  Keep: agents/ (all LangGraph workflows), conversation infrastructure, A2A endpoints
  Strip: Simple runners (context, RAG → those go to Compose), all auth CRUD

Launching forge-product-agent...

Phase 1: Stripping non-Forge code
  Removed: apps/forge/api/src/runners/context-runner.service.ts
  Removed: apps/forge/api/src/runners/rag-runner.service.ts
  Removed: apps/forge/api/src/auth/user.controller.ts
  Removed: apps/forge/api/src/auth/org.controller.ts
  ... (12 more files removed)

Phase 2: Verifying A2A compliance
  marketing-swarm: A2A endpoint present
  legal-department: A2A endpoint present
  cad-agent: A2A endpoint present
  risk-runner: MISSING A2A endpoint — adding...
  prediction-runner: MISSING A2A endpoint — adding...

Phase 3: Updating ports
  API port (dev): 6200
  API port (prod): 7200
  Updated: apps/forge/api/.env.example
  Updated: apps/forge/api/package.json

Phase 4: Build verification
  npm run build: SUCCESS

Specialization complete!
  Files removed: 15
  A2A endpoints added: 2
  Build: Passing
  Port: 6200 (dev) / 7200 (prod)

Next steps:
  1. Run /smoke to test all agent endpoints
  2. Run /scan-errors forge/api to check for lint issues
  3. Run /commit to save the specialized state
```

## Notes

- Run this command from the repo root
- The product agent reads the product's CLAUDE.md for all keep/strip decisions
- After specialization, run `/smoke` to verify agents are working
- After specialization, run `/scan-errors` to check for any remaining issues

## Related

- `/smoke` - Run smoke tests after specialization
- `/scan-errors` - Check for errors after specialization
- Product CLAUDE.md files in each `apps/{product}/` directory

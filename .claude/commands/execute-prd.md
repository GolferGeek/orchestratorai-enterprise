---
description: "Execute a PRD end-to-end using Agent Teams. Reads PRD, builds plan, forms parallel agent team, implements, verifies, tests, and commits."
argument-hint: "[PRD file path(s)] [--review] [--no-commit] [--workers N] [--plan path/to/plan.json]"
category: "development"
uses-skills: ["plan-evaluation-skill"]
uses-agents: ["prd-executor-agent"]
related-commands: ["build-plan", "commit"]
---

# Execute PRD Command

Execute a PRD end-to-end using Agent Teams. This is the "say go" command: hand it a PRD, and it builds a plan, forms a parallel agent team, implements all phases, verifies, tests, and commits.

## What This Does

1. **Reads PRD** from provided file path(s)
2. **Builds structured plan** (`.plan.json`) with phases, steps, agent assignments, dependencies
3. **Forms Agent Team** with domain-specific teammates (web, api, langgraph, product-specific)
4. **Executes in parallel** — teammates work simultaneously on their domains
5. **Runs verification** checkpoints between phases (lint, build, type-check)
6. **Evaluates completeness** against plan deliverables
7. **Runs tests** for affected products
8. **Commits** with quality checks (lint, build, safety review)
9. **Keeps you updated** with a live progress dashboard throughout

## Usage

### Execute PRD immediately (default — "say go")
```
/execute-prd specs/prd-forge-a2a.md
```

### Review plan before executing
```
/execute-prd specs/prd-forge-a2a.md --review
```

### Execute without auto-commit
```
/execute-prd specs/prd-forge-a2a.md --no-commit
```

### Limit number of teammates
```
/execute-prd specs/prd-forge-a2a.md --workers 2
```

### Resume from existing plan (after a failure)
```
/execute-prd --plan docs/plans/forge-a2a.plan.json
```

### Multiple PRDs
```
/execute-prd specs/prd-forge-agents.md specs/prd-compose-runners.md
```

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--review` | off | Pause after plan creation to review and approve before executing |
| `--no-commit` | off | Skip the automatic commit phase at the end |
| `--workers N` | 3 | Maximum number of Agent Team teammates |
| `--plan path` | - | Resume from an existing `.plan.json` file instead of building a new one |

## How It Works

### Agent Teams

This command uses the Agent Teams feature. Each teammate is an independent Claude Code session that:
- Has its own context window
- Can read/write files in its assigned domain
- Picks up tasks from a shared task list

### Team Formation

The team is formed based on which products and domains the PRD touches:

| PRD touches... | Teammate spawned | Ownership |
|----------------|-----------------|-----------|
| `apps/forge/web/**` | web-teammate | Forge web files |
| `apps/forge/api/**` | forge-api-teammate | Forge API files |
| `apps/compose/api/**` | compose-api-teammate | Compose API files |
| `apps/compose/web/**` | web-teammate | Compose web files |
| `apps/ambient/**` | ambient-teammate | Pulse/Bridge files |
| LangGraph workflows | langgraph-teammate | LangGraph graph files |

If the PRD only touches one domain, a single subagent is used instead of a full team.

### Progress Dashboard

You'll see a live dashboard like this during execution:

```
PRD Execution: Forge A2A Endpoint Compliance
================================================================
Plan: docs/plans/forge-a2a.plan.json
Started: 10:00:00  Elapsed: 8m 30s  Est. Remaining: 12m

Overall: Phase 2/3 (50%)  |===============               |

Teammates:
+-----------+----------+----------------------------------+---------+
| Teammate  | Domain   | Current Task                     | Done    |
+-----------+----------+----------------------------------+---------+
| api-1     | forge/api| Add A2A to marketing-swarm       | 2/5     |
| api-2     | forge/api| Add A2A to legal-department      | 1/5     |
+-----------+----------+----------------------------------+---------+

Phase Progress:
  Phase 1: Foundation           [COMPLETED] 2/2 steps
  Phase 2: A2A Endpoints        [IN PROGRESS] 3/8 steps
  Phase 3: Testing & Commit     [PENDING] 0/2 steps
```

## Requirements

- **Agent Teams enabled**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be set in `.claude/settings.json`
- **If Agent Teams fails to initialize**: The command will report the error and stop. It will NOT fall back to sequential execution.

## Differences from `/build-plan`

| Feature | `/build-plan` | `/execute-prd` |
|---------|--------------|----------------|
| Creates plan | Yes | Yes (internally) |
| Executes plan | No | Yes |
| Parallel execution | N/A | Yes (Agent Teams) |
| Auto-commit | N/A | Yes (unless --no-commit) |
| Progress dashboard | No | Yes |

## PRD File Locations

PRDs are typically stored in:
- `specs/prd-*.md`
- `docs/prd/active/*.md`
- `docs/prd/history/*/PRD.md`

## Related Commands

- **`/build-plan`**: Just builds the plan (no execution). Use this to review/edit the plan before running `/execute-prd --plan`
- **`/commit`**: Just the commit step. Used internally by `/execute-prd` in the final phase.

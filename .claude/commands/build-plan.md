---
description: "Build a structured, machine-readable execution plan from PRD(s), optimized for agent delegation and progress tracking."
argument-hint: "[PRD file path(s) or PRD content] [--output path] [--stdout]"
category: "development"
uses-skills: ["plan-evaluation-skill"]
uses-agents: []
related-commands: ["execute-prd"]
---

# Build Plan Command

Build a structured, machine-readable execution plan from one or more Product Requirements Documents (PRDs). The plan is optimized for the base agent to delegate work to sub-agents and includes progress tracking fields for monitoring execution.

## What This Does

1. **Parses PRD(s):**
   - Accepts one or more PRD file paths
   - Accepts PRD content directly
   - Extracts all relevant sections (Overview, Technical Plan, Development Roadmap, etc.)

2. **Creates Structured Plan:**
   - Generates JSON plan breaking work into phases and steps
   - Assigns agents to each step
   - Defines dependencies between steps
   - Includes validation checkpoints
   - Adds progress tracking fields (status, completion, timestamps)

3. **Outputs Machine-Readable Format:**
   - Saves as JSON file (`.plan.json`) for use with `/execute-prd`
   - Can output to stdout for inspection
   - Includes metadata (PRD source, created date, version)

## Usage

### Build Plan from Single PRD
```
/build-plan docs/prd/active/forge-a2a-prd.md
```

### Build Plan from Multiple PRDs
```
/build-plan docs/prd/active/forge-agents-prd.md docs/prd/active/compose-runners-prd.md
```

### Build Plan and Save to File
```
/build-plan docs/prd/active/forge-a2a-prd.md --output docs/plans/forge-a2a.plan.json
```

### Build Plan and Output to Stdout
```
/build-plan docs/prd/active/forge-a2a-prd.md --stdout
```

### Build Plan from PRD Content
```
/build-plan "PRD: Add A2A endpoints to all Forge agents. Overview: ... Technical Plan: ..."
```

## Plan Structure

The generated plan follows this JSON structure:

```json
{
  "metadata": {
    "version": "1.0",
    "created_at": "2026-03-14T10:00:00Z",
    "prd_sources": ["docs/prd/active/forge-a2a-prd.md"],
    "title": "Forge A2A Endpoint Compliance",
    "summary": "Add A2A endpoints to all LangGraph agents in Forge"
  },
  "summary": "Add A2A endpoints to all LangGraph agents in Forge",
  "phases": [
    {
      "id": "phase-1",
      "label": "A2A Endpoint Implementation",
      "status": "pending",
      "progress": 0,
      "started_at": null,
      "completed_at": null,
      "steps": [
        {
          "id": "step-1-1",
          "action": "Add A2A endpoint and agent.json to marketing-swarm",
          "agent": "api-architecture-agent",
          "status": "pending",
          "progress": 0,
          "started_at": null,
          "completed_at": null,
          "depends_on": [],
          "deliverables": ["marketing-swarm.agent.ts", ".well-known/agent.json"],
          "validation_checkpoint": "quality-gates",
          "human_checkpoint_id": null
        }
      ]
    }
  ],
  "checkpoints": [
    {
      "id": "quality-gates",
      "label": "Quality Gates",
      "description": "Run lint, build, and tests",
      "status": "pending",
      "triggered_after": ["step-1-1"]
    }
  ],
  "dependencies": {
    "phase-2": ["phase-1"]
  },
  "execution_strategy": {
    "mode": "sequential",
    "parallel_phases": []
  }
}
```

## PRD Parsing

### From PRD to Plan Mapping

- **Overview/Summary** → `metadata.title`, `summary`
- **Problem & Goals** → `metadata.goals`
- **Scope** → `metadata.scope` (in_scope, out_of_scope)
- **Technical Plan** → Agent assignments
  - Forge API changes → `forge-api-agent` or `api-architecture-agent`
  - Forge Web changes → `web-architecture-agent`
  - Compose API changes → `compose-api-agent`
  - LangGraph workflows → `langgraph-architecture-agent`
  - Database migrations → `api-architecture-agent`
- **Development Roadmap** → `phases` array
- **Deliverables** → `steps[].deliverables`
- **Test & Verification** → `checkpoints` array

## Agent Assignment Logic

Agents are assigned based on file paths in the PRD:

| PRD mentions... | Assigned agent |
|-----------------|----------------|
| `apps/forge/api/**` | `api-architecture-agent` |
| `apps/forge/web/**` | `web-architecture-agent` |
| `apps/compose/api/**` | `api-architecture-agent` |
| `apps/compose/web/**` | `web-architecture-agent` |
| `apps/auth/api/**` | `api-architecture-agent` |
| `apps/ambient/**` | `api-architecture-agent` |
| LangGraph workflows | `langgraph-architecture-agent` |
| New skills/agents | `agent-builder-agent` |

## Output Options

### Save to File (Default)
```
/build-plan docs/prd/active/my-prd.md --output docs/plans/my-plan.json
```

### Auto-Generated Filename
```
/build-plan docs/prd/active/my-prd.md
```
Auto-saves to `docs/plans/my.plan.json` (derived from PRD filename).

### Output to Stdout
```
/build-plan docs/prd/active/my-prd.md --stdout
```

## Example: Complete Workflow

### Step 1: Build Plan
```
/build-plan docs/prd/active/forge-a2a-prd.md --output docs/plans/forge-a2a.plan.json
```

Output:
```
Plan created: docs/plans/forge-a2a.plan.json
3 phases, 8 steps, 4 checkpoints
Agents: api-architecture-agent, web-architecture-agent
```

### Step 2: Review Plan (Optional)
```bash
cat docs/plans/forge-a2a.plan.json | jq '.phases[] | {id, label, steps: [.steps[] | {id, action, agent}]}'
```

### Step 3: Execute Plan
```
/execute-prd --plan docs/plans/forge-a2a.plan.json
```

## Related

- **`/execute-prd`** - Execute the plan (uses `.plan.json` files built here)
- **Architecture agents** - Domain specialists that execute plan steps

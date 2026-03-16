---
description: "Get explanations about Claude Code features, commands, skills, or agents in the OrchestratorAI Enterprise ecosystem"
argument-hint: "<topic> - Examples: commit, scan-errors, specialize, execution-context, forge, compose, a2a, planes"
category: "ecosystem"
uses-skills: []
uses-agents: []
related-commands: []
---

# Explain Claude Code Components

Get an explanation about how to use Claude Code features, commands, skills, agents, or patterns in the OrchestratorAI Enterprise ecosystem.

## Usage

```
/explain-claude <topic>
```

## Topics You Can Ask About

### Commands
- `/explain-claude commit` - How to commit changes with quality gates
- `/explain-claude create-pr` - How to create a pull request
- `/explain-claude review-pr` - How to review a PR
- `/explain-claude scan-errors` - How to scan for build/lint/test errors
- `/explain-claude fix-errors` - How to fix errors with parallel workers
- `/explain-claude monitor` - How to analyze codebase health
- `/explain-claude harden` - How to harden issues found by monitoring
- `/explain-claude test` - How to run/generate tests
- `/explain-claude build-plan` - How to create execution plans from PRDs
- `/explain-claude execute-prd` - How to execute a PRD end-to-end
- `/explain-claude specialize` - How to specialize a product from the monolith
- `/explain-claude smoke` - How to run agent smoke tests
- `/explain-claude backup-db` - How to back up the database
- `/explain-claude restore-db` - How to restore the database
- `/explain-claude update` - How to do the daily environment update

### Skills and Concepts
- `/explain-claude execution-context` - How ExecutionContext flows through the system
- `/explain-claude transport-types` - How the A2A protocol works (JSON-RPC 2.0)
- `/explain-claude planes` - How LLM/database/observability planes work
- `/explain-claude a2a` - Agent-to-agent communication protocol
- `/explain-claude quality-gates` - What quality checks run before commits/PRs

### Products
- `/explain-claude forge` - Forge product (complex agent dashboards)
- `/explain-claude compose` - Compose product (simple composable agents)
- `/explain-claude auth` - Auth product (standalone auth service)
- `/explain-claude admin` - Admin product (admin web UI)
- `/explain-claude flow` - Flow product (productivity)
- `/explain-claude pulse` - Pulse product (internal ambient automation)
- `/explain-claude bridge` - Bridge product (external A2A communication)
- `/explain-claude command` - Command product (navigation shell)

### Agents
- `/explain-claude api-agent` - API architecture agent
- `/explain-claude web-agent` - Web architecture agent
- `/explain-claude langgraph-agent` - LangGraph architecture agent
- `/explain-claude pr-review-agent` - PR review agent
- `/explain-claude smoke-test-agent` - Smoke test agent

### Architecture
- `/explain-claude hierarchy` - Overall system hierarchy and structure
- `/explain-claude three-layer` - Three-layer web architecture (component/store/service)
- `/explain-claude nestjs-patterns` - NestJS API patterns
- `/explain-claude langgraph-patterns` - LangGraph workflow patterns
- `/explain-claude observability` - Observability plane patterns

## What You Get

For each topic, you'll receive:
1. **Purpose** - What it does and when to use it
2. **Usage** - Command syntax and examples
3. **Workflow** - Step-by-step of what happens
4. **Related** - Other relevant commands/skills/agents
5. **Tips** - Best practices and common pitfalls

## Examples

### Explain a command
```
/explain-claude specialize
```

Output:
- What product specialization does
- Which products can be specialized
- How the product agent uses CLAUDE.md guidance
- What gets stripped vs kept
- How to verify after specialization

### Explain a product
```
/explain-claude forge
```

Output:
- What Forge does (complex agent dashboards)
- What agents live in Forge (marketing swarm, legal dept, CAD, risk, predictor)
- Port assignments (6200/6201 dev, 7200/7201 prod)
- Key architecture rules (every agent needs A2A endpoint, observability plane)
- What does NOT belong in Forge (simple runners → Compose)

### Explain a concept
```
/explain-claude execution-context
```

Output:
- What ExecutionContext is (orgSlug, userId, etc.)
- How it flows through the system (store → component → service → API)
- The key rule: always received, never created inline
- Common violations and how to fix them

### Explain A2A protocol
```
/explain-claude a2a
```

Output:
- JSON-RPC 2.0 format for agent-to-agent calls
- The `.well-known/agent.json` discovery mechanism
- Transport modes (plan, build, converse, hitl)
- How Forge agents expose A2A endpoints
- How Bridge handles external A2A

## Implementation

When this command runs:
1. Identifies the topic type (command, product, skill, agent, concept)
2. Reads the relevant documentation:
   - Commands: `.claude/commands/{topic}.md`
   - Products: `apps/{product}/*/CLAUDE.md`
   - Skills: `.claude/skills/{topic}-skill/SKILL.md`
   - Agents: `.claude/agents/{topic}.md`
   - Concepts: relevant skill and agent docs
3. Summarizes the key information in a clear format
4. Provides examples and tips
5. Links to the source files for deeper reading

## Notes

- If the topic isn't found, suggests similar topics
- Can combine multiple topics: `/explain-claude forge a2a`
- For product-specific questions, reading the product's CLAUDE.md directly is also helpful

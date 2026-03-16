---
description: "Run agent smoke tests against the running API. Tests all agents in parallel via pure HTTP — no browser needed."
argument-hint: "[all|converse|build|<agent-slug>|<product>]" - Examples: "all", "converse", "build", "legal-department", "marketing-swarm", "forge", "compose"
category: "testing"
uses-skills: []
uses-agents: ["smoke-test-agent"]
related-commands: ["test", "scan-errors"]
---

# /smoke — Agent Smoke Tests

## Purpose

Run pure HTTP E2E smoke tests against every agent in the running API. Authenticates once, fires requests at all agents in parallel, and reports pass/fail results with timing. ENV-agnostic — works regardless of LLM_PROVIDER configuration.

## Usage

```bash
# Run all agents (default)
/smoke

# Run only converse (sync) agents
/smoke converse

# Run only build (async) agents
/smoke build

# Run a specific agent
/smoke legal-department
/smoke marketing-swarm

# Run all agents for a specific product
/smoke forge
/smoke compose

# With custom model
/smoke --model gemma3:4b
```

## Workflow

### 1. Determine Scope

Based on the argument:
- `all` or no argument — run all registered agents
- `converse` — run only sync agents (POST /tasks)
- `build` — run only async agents (POST /tasks/async + SSE)
- `<agent-slug>` — run one specific agent
- `<product>` (forge, compose) — run all agents belonging to that product

### 2. Run the Smoke Tests

Execute the E2E smoke test file for the relevant product(s):

**Forge agents:**
```bash
cd apps/forge/api && npx jest --config jest.config.js --testPathPattern 'agent-smoke.e2e' --runInBand --forceExit 2>&1
```

**Compose agents:**
```bash
cd apps/compose/api && npx jest --config jest.config.js --testPathPattern 'agent-smoke.e2e' --runInBand --forceExit 2>&1
```

**Env var overrides (set before running):**
- `E2E_API_URL` — API base URL (e.g., `http://localhost:6200` for Forge)
- `E2E_TEST_EMAIL` — Login email
- `E2E_TEST_PASSWORD` — Login password
- `E2E_PROVIDER` — LLM provider (default: `ollama`)
- `E2E_MODEL` — LLM model (default: `ministral-3:3b`)

### 3. Analyze Results

The test outputs a summary table:

```
================================================================================
  AGENT SMOKE TEST RESULTS
================================================================================
  PASS  general-assistant            converse      2.0s [201]  OK (1 keys)
  PASS  legal-contracts-agent        converse     11.9s [201]  OK (3 keys)
  FAIL  cad-agent                    converse      0.1s [201]  Agent error: ...
  PASS  marketing-swarm              build         0.1s [202]  OK via SSE (1 events)
--------------------------------------------------------------------------------
  Total: 12 | Pass: 10 | Fail: 2 | Error: 0
================================================================================
```

### 4. Investigate Failures

For any failing agent, investigate:
- The agent's execution pipeline (read the agent service file)
- Known failure modes for that agent type
- What to check first (LLM connectivity, DB, missing data, etc.)

### 5. Report Results

Present results clearly:
- Which agents passed and their response times
- Which agents failed and the error details
- Whether failures are ENV-specific (model availability, rate limits) or systemic (DB, code bugs)
- Recommended fixes for each failure

## Agent Registry

### Forge Agents (apps/forge/api/)

**Sync Agents (Converse via POST /tasks):**

| Agent | Slug | Type | Org | Port |
|-------|------|------|-----|------|
| Legal Department | `legal-department` | langgraph | legal | 6200 |
| CAD Agent | `cad-agent` | langgraph | engineering | 6200 |
| Risk Runner | `risk-runner` | langgraph | risk | 6200 |

**Async Agents (Build via POST /tasks/async + SSE):**

| Agent | Slug | Type | Org | Port |
|-------|------|------|-----|------|
| Marketing Swarm | `marketing-swarm` | langgraph | marketing | 6200 |
| Predictor | `predictor` | langgraph | prediction | 6200 |

### Compose Agents (apps/compose/api/)

**Sync Agents:**

| Agent | Slug | Type | Port |
|-------|------|------|------|
| General Assistant | `general-assistant` | context | 6300 |
| Legal Contracts | `legal-contracts-agent` | rag | 6300 |
| Legal Policies | `legal-policies-agent` | rag | 6300 |
| HR Assistant | `hr-assistant` | rag | 6300 |
| Image Generator | `image-generator` | media | 6300 |

## Common Failure Patterns

| Error | Cause | Fix |
|-------|-------|-----|
| `model "X" not found` (404) | Model doesn't exist on current LLM provider | Use valid model for the provider |
| `429 Too Many Requests` | Rate limited by LLM provider (parallel requests) | Re-run with fewer agents or wait |
| `FK constraint` error | Missing prerequisite data in DB | Check conversation/task exists |
| `Request failed 404` | Wrong endpoint, wrong port, or service not running | Check E2E_API_URL, verify API is running |
| `SSE timed out` | Async agent took too long | Increase timeout or check agent logs |
| `401 Unauthorized` | Auth token expired or invalid | Check E2E credentials |

## Related Commands

- `/test` — Run unit/integration tests
- `/scan-errors` — Scan for build/lint/test errors
- `/monitor` — Analyze codebase health
- `/specialize` — Specialize a product (run smoke after to verify)

---
description: Run tests, generate tests, fix failing tests, or check coverage. Supports all products (forge, compose, auth, ambient) and test types (unit, integration, E2E).
argument-hint: "[product] [action] [target]" - Examples: "forge/api unit", "compose/web generate src/components/AgentChat.vue", "compose/api fix", "coverage"
category: "quality"
uses-skills: []
uses-agents: ["testing-agent"]
related-commands: ["monitor", "harden", "scan-errors"]
---

# Test Command

## Purpose

Run tests, generate tests, fix failing tests, or check test coverage across all products (forge, compose, auth, admin, ambient/pulse, ambient/bridge).

## Usage

```bash
/test [product] [action] [target]
```

### Arguments

- **`product`** (optional): Which product to test
  - `forge/api` - Forge API (complex agents backend)
  - `forge/web` - Forge Web (complex agent dashboards frontend)
  - `compose/api` - Compose API (simple composable agents backend)
  - `compose/web` - Compose Web (simple agents frontend)
  - `auth/api` - Auth API
  - `admin/web` - Admin Web
  - `ambient/pulse` - Pulse ambient automation
  - `ambient/bridge` - Bridge external A2A
  - `command/web` - Command navigation shell
  - `all` - All products
  - If omitted, detects from changed files
- **`action`** (optional): What to do (`run`, `generate`, `fix`, `coverage`, or `setup`)
  - Default: `run`
- **`target`** (optional): Specific file or pattern to test/generate

### Examples

```bash
# Run all tests for affected products
/test

# Run tests for specific products
/test forge/api
/test compose/web

# Generate tests for a file
/test generate apps/forge/api/src/agents/marketing-swarm.service.ts
/test forge/web generate src/components/AgentDashboard.vue

# Fix failing tests
/test fix
/test compose/api fix

# Check coverage
/test coverage
/test forge/api coverage

# Set up test infrastructure for a product
/test setup
```

## Workflow

### 1. Detect Context

**If product not specified:**
- Check git diff for changed files
- Determine affected products from file paths (`apps/forge/`, `apps/compose/`, etc.)
- If multiple products affected, run tests for all
- If no changes, prompt user for product

### 2. Execute Action

**Run Tests:**
1. Determine test type (unit, integration, e2e)
2. Run appropriate test command for product
3. Report results (passed, failed, skipped)
4. If failures, offer to fix

**Generate Tests:**
1. Identify file type (component, service, controller, agent, runner, etc.)
2. Determine product context (forge uses LangGraph patterns, compose uses runner patterns, etc.)
3. Generate test file following product-specific patterns
4. Ensure ExecutionContext and A2A compliance
5. Create test file with proper structure

**Fix Tests:**
1. Run tests to identify failures
2. Analyze failure messages and stack traces
3. Determine root cause (code bug vs test bug)
4. Fix the issue
5. Re-run tests to verify fix
6. Ensure all tests pass

**Check Coverage:**
1. Run coverage report for product(s)
2. Analyze coverage metrics
3. Identify uncovered code
4. Report coverage against thresholds
5. Suggest tests for uncovered critical paths

**Set Up Tests:**
1. Check if test infrastructure exists
2. Set up test framework if missing (Vitest for web, Jest for API)
3. Configure test environment
4. Create test utilities and helpers
5. Add test scripts to package.json

### 3. Report Results

**Success:**
```
Tests Passed

Results:
  forge/api: 45 passed, 0 failed
  forge/web: 32 passed, 0 failed
  compose/api: 28 passed, 0 failed
```

**Failures:**
```
Tests Failed

Results:
  forge/api: 2 failed, 43 passed
  compose/web: All passed

Fix Options:
  1. Review failing tests above
  2. Run: /test fix
  3. Or manually fix and re-run tests
```

**Coverage:**
```
Coverage Report

forge/api:
   Lines: 78% (threshold: 75%)
   Functions: 82% (threshold: 75%)
   Branches: 71% (threshold: 70%)
```

## Product-Specific Commands

### API Products (`apps/forge/api/`, `apps/compose/api/`, `apps/auth/api/`)

```bash
# Unit tests (Jest/NestJS)
cd apps/{product}/api && npm test

# E2E tests (requires services running)
cd apps/{product}/api && npm run test:e2e

# Coverage
cd apps/{product}/api && npm run test:cov
```

### Web Products (`apps/forge/web/`, `apps/compose/web/`)

```bash
# Unit tests (Vitest)
cd apps/{product}/web && npm run test:unit

# E2E tests (Cypress)
cd apps/{product}/web && npm run test:e2e

# Coverage
cd apps/{product}/web && npm run test:coverage
```

### Ambient Products (`apps/ambient/pulse/`, `apps/ambient/bridge/`)

```bash
# Unit tests
cd apps/ambient/{product} && npm test

# E2E tests
cd apps/ambient/{product} && npm run test:e2e
```

## Related Commands

- `/scan-errors` - Scan for build/lint/test errors
- `/monitor` - Analyze codebase health
- `/harden` - Fix issues found in monitoring

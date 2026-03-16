---
description: "Create pull request with progressive validation. Analyzes changed files, runs quality checks, and creates PR if all checks pass."
argument-hint: "[base branch] [title] [description] - Base branch defaults to main/master, title auto-generated from changes if not provided"
category: "pr-workflow"
uses-skills: ["execution-context-skill", "transport-types-skill", "quality-gates-skill"]
uses-agents: ["pr-review-agent"]
related-commands: ["review-pr", "commit"]
---

# /create-pr Command

## Purpose

Create a pull request with progressive validation. This command completes the PR workflow by creating PRs after validating changes through architecture skills and quality gates.

**PR Workflow:**
- `/create-pr` - Create PR with validation
- `/review-pr` - Review PR systematically

## Usage

```
/create-pr [base branch] [title] [description]
```

**Arguments:**
- `base branch` (optional): Target branch for PR (default: `main` or `master`)
- `title` (optional): PR title (auto-generated from changes if not provided)
- `description` (optional): PR description (auto-generated if not provided)

## Examples

```
/create-pr
# Creates PR to main/master with auto-generated title and description

/create-pr develop
# Creates PR to develop branch

/create-pr main "feat(api): add user service"
# Creates PR to main with custom title

/create-pr main "feat(api): add user service" "Adds user service with CRUD operations"
# Creates PR with custom title and description
```

## Workflow

### 1. Analyze Changed Files

**Detect Changes:**
- Use `git diff` to identify changed files
- Classify files by domain (web, API, LangGraph, agent)
- Identify affected product areas (forge, compose, auth, flow, etc.)

### 2. Progressive Skill Invocation

**If execution context files changed:**
- Load `execution-context-skill`
- Validate ExecutionContext flow
- Check for violations
- Stop if critical violations found

**If transport type files changed:**
- Load `transport-types-skill`
- Validate A2A protocol compliance
- Check transport type contracts
- Stop if critical violations found

**If web files changed:**
- Validate against web patterns (Vue 3 Composition API, store-service-component separation)
- Stop if critical violations found

**If API files changed:**
- Validate against API patterns (NestJS modules, controller/service separation)
- Stop if critical violations found

**If LangGraph/agent files changed:**
- Validate against LangGraph patterns (StateGraph, A2A endpoints, observability plane)
- Stop if critical violations found

### 3. Run Quality Gates

**All quality gates must pass before PR creation:**

1. **Format Code**
   ```bash
   npm run format
   ```

2. **Lint Code**
   ```bash
   npm run lint
   ```
   Must pass (no errors)

3. **Build Code**
   ```bash
   npm run build
   ```
   Must succeed

4. **Run Tests**
   ```bash
   npm test
   ```
   Must pass

**If any check fails:**
- PR creation is blocked
- Error message displayed
- User must fix issues before retrying

### 4. Generate PR Details

**Auto-Generate Title (if not provided):**
- Analyze changed files
- Determine change type (feat, fix, refactor, etc.)
- Determine scope (web, api, forge, compose, flow, etc.)
- Generate title: `feat(scope): description`

**Auto-Generate Description (if not provided):**

```markdown
## Changes

- Summary of what changed

## Architecture Validation

- ExecutionContext: Passed / Not applicable
- Transport Types: Passed / Not applicable
- Architecture: Passed / Not applicable

## Quality Gates

- Format: Passed
- Lint: Passed
- Build: Passed
- Tests: Passed

## Files Changed

- List of changed files
```

### 5. Create PR

**Use GitHub CLI:**
```bash
gh pr create \
  --base <base-branch> \
  --title "<title>" \
  --body "<description>"
```

### 6. Report Results

**Success:**
```
PR Created Successfully

PR: #123 - feat(forge/api): add marketing swarm A2A endpoint
URL: https://github.com/org/repo/pull/123
Base: main
Status: Open

Validation Summary:
- ExecutionContext: Passed
- Transport Types: Passed
- Quality Gates: All Passed
```

**Failure:**
```
PR Creation Blocked

Reason: Lint errors found

Errors:
- apps/forge/api/src/agents/marketing.service.ts:5:10 - 'any' type not allowed

Please fix errors and try again.
```

## Error Handling

### No Changes Detected
```
No changes detected. Please make changes before creating a PR.
```

### Quality Gate Failure
```
Quality gate failed: Lint

Errors found:
- file.ts:5:10 - error detail

Please fix errors and try again.
```

### Architecture Violation
```
Architecture violation: ExecutionContext

Violation: ExecutionContext created in component instead of received from store
File: apps/forge/web/src/components/agent-dashboard.vue:15

Please fix violation and try again.
Reference: execution-context-skill
```

### GitHub CLI Not Available
```
GitHub CLI not available. Please install: https://cli.github.com/
```

## Related

- **`/review-pr`** - Review PRs systematically
- **`/commit`** - Commit changes first
- **`/test`** - Run tests to verify changes
- **Architecture skills** - For validation patterns

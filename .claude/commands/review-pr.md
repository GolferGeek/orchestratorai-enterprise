---
description: "Review a pull request systematically. Runs quality checks, analyzes code quality and architecture, and generates review comments."
argument-hint: "[PR number or branch name]"
category: "pr-workflow"
uses-skills: ["execution-context-skill", "transport-types-skill", "quality-gates-skill"]
uses-agents: ["pr-review-agent"]
related-commands: ["create-pr"]
---

# Review Pull Request

Systematically review a pull request by running quality checks, analyzing code quality and architecture, and generating actionable feedback.

## What This Does

1. **Gets PR Information:**
   - PR number, title, author, base branch, head branch, status
   - Checks if PR is draft or ready for review

2. **Reads PR Diff:**
   - Analyzes all changed files
   - Identifies file types (TypeScript, Vue, YAML, etc.)
   - Identifies which product(s) are affected (forge, compose, auth, flow, etc.)

3. **Checks CI Status:**
   - Verifies all CI/CD checks are passing
   - Notes any failing checks

4. **Runs Quality Checks:**
   - Lints code (`npm run lint`)
   - Builds code (`npm run build`)
   - Runs tests (`npm test`)
   - Fixes issues if appropriate

5. **Analyzes Code Quality:**
   - **Architecture**: Does code follow OrchestratorAI Enterprise patterns?
   - **ExecutionContext**: Is ExecutionContext passed correctly (received, not created)?
   - **Transport Types**: Are A2A calls compliant (JSON-RPC 2.0)?
   - **Planes**: Are LLM/database/observability planes used consistently?
   - **Code Quality**: Error handling, type safety, organization
   - **Tests**: Coverage and quality

6. **Generates Review:**
   - Actionable feedback
   - Approval or change requests
   - Comments on specific lines/files

## Usage

### Review Current Branch PR
```
/review-pr
```
Reviews the PR for the current branch (if on a PR branch).

### Review Specific PR
```
/review-pr 123
```
Reviews PR #123.

### Review Specific Branch
```
/review-pr feature/new-feature
```
Reviews the PR for the specified branch.

## Quality Checks

All quality checks must pass:
- Lint: No lint errors
- Build: Build succeeds
- Tests: All tests pass
- Architecture: Follows patterns
- ExecutionContext: Passed correctly (received from store, not created inline)
- A2A Compliance: Transport types followed (JSON-RPC 2.0)

## Architecture Validation

The review checks product-specific patterns:

**Forge (Complex Agents):**
- Every LangGraph agent has an A2A endpoint
- All LLM calls go through the observability plane
- Dashboards use planes correctly (LLM, database, observability)
- ExecutionContext flows correctly through agent pipelines

**Compose (Simple Agents):**
- Only the 5 runner types present (context, RAG, API, external, image/media)
- No LangGraph workflows (those belong in Forge)
- Composition orchestration layer chains runners correctly

**Auth:**
- No agent runners or dashboards
- JWT issuance and validation correct
- Org/user/role/entitlements management correct

**Flow:**
- Only orch_flow schema tables touched
- Teams, tasks, sprints, files endpoints correct
- No agent runner code

**Ambient (Pulse/Bridge):**
- SSE streaming matches platform standard
- Observability plane consistent
- A2A implementation matches platform standard

## Review Output

The review includes:
- **Summary**: Overall assessment
- **Quality Checks**: Status of lint, build, tests
- **Architecture**: Compliance with patterns
- **Specific Issues**: Line-by-line feedback
- **Recommendations**: Suggested improvements
- **Decision**: Approve or request changes

## Related

- `/create-pr` - Create a PR before reviewing
- `execution-context-skill` - ExecutionContext validation
- `transport-types-skill` - A2A compliance validation

## Notes

- Uses GitHub CLI (`gh`) for PR access
- Automatically checks out PR branch for quality checks
- Can fix lint/build issues automatically if appropriate
- Provides actionable feedback, not just criticism

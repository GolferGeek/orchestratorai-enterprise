---
description: "Commit changes directly to current branch after quality checks"
category: "development"
uses-skills: ["quality-gates-skill"]
uses-agents: []
related-commands: ["create-pr"]
---

# Commit Directly to Current Branch

Commit your changes to the current branch after running quality gates (lint, build) and a safety review.

## What This Does

1. **Runs quality gates:**
   - Formats code (`npm run format`)
   - Lints code (`npm run lint` - must pass)
   - Builds code (`npm run build` - must pass)

2. **Performs safety review:**
   - Checks changed files for obvious issues
   - Validates execution context usage (if relevant)
   - Validates transport types (if relevant)
   - Checks architecture patterns

3. **Commits changes:**
   - Stages all changes
   - Generates commit message (or uses provided)
   - Commits to current branch

**Note:** This does NOT push. Use `/create-pr` if you want to create a pull request.

## Usage

```
/commit
```

Or with a custom message:

```
/commit "feat(api): add new feature"
```

## Quality Gates

All quality gates must pass before committing:

- Format: Code is formatted
- Lint: No lint errors
- Build: Build succeeds
- Safety: No obvious violations found

If any check fails, the commit is blocked.

## Safety Review

The safety review checks:

- **Execution Context**: Properly passed and used (if execution context files changed)
- **Transport Types**: A2A compliance maintained (if transport type files changed)
- **Architecture**: Patterns followed (front-end, API, LangGraph)
- **Code Quality**: Error handling, type safety, etc.

## Git Commands Permission

The skill has full permission to run all git commands without prompting:
- `git diff` (all variations) - Used to analyze changes
- `git status` - Used to check changed files
- All other git commands - Full access

## Commit Message

**By default, a commit message is automatically generated** by analyzing your changed files. The message follows conventional commits format:

- `feat(scope): description` - New features
- `fix(scope): description` - Bug fixes
- `refactor(scope): description` - Code restructuring
- etc.

**How it works:**
1. Analyzes git diff to see what changed
2. Reads changed files to understand modifications
3. Determines type (feat, fix, refactor, etc.) from the nature of changes
4. Determines scope (api, web, langgraph, etc.) from file paths
5. Generates a clear, descriptive message

**To use a custom message:**
```
/commit "your custom message here"
```

The custom message will be used exactly as provided.

## Examples

### Basic Commit (Auto-Generated Message)
```
/commit
```
Runs all checks, analyzes your changes, generates a commit message automatically, then commits.

**Example:** If you added a new validation service in the API, it might generate:
```
feat(api): add validation service
```

### Commit with Message
```
/commit "fix(web): resolve execution context update issue"
```
Runs checks, uses your message, commits.

## Related

- `/create-pr` - Create pull request (for PR workflow)
- `/review-pr` - Review an existing PR

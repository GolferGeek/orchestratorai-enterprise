---
name: direct-commit-skill
description: Commit changes directly to current branch after quality checks (lint, build, safety review). Use when user wants to commit without creating a PR, or when user mentions committing, committing changes, or direct commit.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Direct Commit Skill

Commit changes directly to the current branch after running quality gates and safety checks. This is for the architect's workflow - bypasses PR process but still ensures code quality.

## When to Use This Skill

Use this skill when:
- User wants to commit changes directly to current branch
- User mentions "commit", "commit these changes", "commit and push"
- User wants to bypass PR workflow
- User is working as the architect (direct commits allowed)

**Do NOT use this skill when:**
- User explicitly wants to create a PR
- User mentions "pull request" or "PR"

## Quick Workflow

### For commit (commit only):

1. **Check git status** - Verify there are changes to commit
2. **Run quality gates** - Format, lint, build (see quality-gates-skill)
3. **Safety review** - Check changed files for issues
4. **Generate commit message** - Analyze changes and create message
5. **Commit** - Stage specific files and commit

### For commit-push (commit and push):

Same as commit, but after successful commit:
6. **Push** - Push to origin/current-branch

## Quality Gates (REQUIRED before commit)

```bash
# 1. Format
npm run format

# 2. Lint
npm run lint

# 3. Build (verify compilation)
npm run build

# Only run tests if affecting tested code
npm test
```

**CRITICAL**: Do NOT commit if any quality gate fails.

## Safety Review

Before committing, check changed files for:
- **Secrets/credentials** - Never commit API keys, passwords, tokens
- **Debug code** - Remove console.log, debugger statements
- **TODO markers** - Flag for follow-up
- **Breaking changes** - Check imports, exports, API contracts
- **ExecutionContext violations** - Verify context flows correctly
- **A2A compliance** - Verify transport types used correctly

## Commit Message Generation

**Analyze changes to create message:**
1. Run `git diff --staged` to see what's changing
2. Identify the type: feat, fix, refactor, test, chore, docs
3. Identify the scope: module/component affected
4. Write brief, clear description

**Format:**
```
type(scope): brief description

Optional longer description if needed.
```

**Examples:**
```
feat(auth): add token validation to product API calls
fix(forge): correct port assignment in dev config
refactor(transport-types): update A2A request structure
chore(deps): update transport-types package version
```

## Git Commands

```bash
# Check status
git status

# See staged changes
git diff --staged

# Add specific files (NEVER use git add -A blindly)
git add path/to/specific/file.ts
git add path/to/another/file.ts

# Commit
git commit -m "type(scope): description"

# Push (for commit-push)
git fetch origin
git push origin $(git branch --show-current)
```

## Push Workflow

When pushing to remote:

1. **Fetch remote changes** - `git fetch origin`
2. **Check if behind** - `git status` shows if local is behind remote
3. **Merge if needed** - `git merge origin/$(git branch --show-current) --no-edit`
4. **Push** - `git push origin $(git branch --show-current)`
5. **Set upstream on first push** - `git push -u origin $(git branch --show-current)`

## Related Skills

- **quality-gates-skill** - Quality gate patterns
- **strict-linting-skill** - Hardcore linting rules and catching anti-patterns
- **execution-context-skill** - For execution context validation
- **transport-types-skill** - For A2A compliance checks

## Important Notes

- Always run quality gates before committing
- Stage specific files, not everything with `-A`
- Never commit secrets or credentials
- Check ExecutionContext and A2A compliance in changed files

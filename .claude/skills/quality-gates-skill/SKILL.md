---
name: quality-gates-skill
description: Ensure code quality before commits. Run lint, format, test, build. Use npm scripts for quality checks. CRITICAL: All tests must pass, no lint errors, code must be formatted before committing.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Quality Gates Skill

**CRITICAL**: Code must pass all quality gates before committing: lint, format, test, build.

## When to Use This Skill

Use this skill when:
- Before committing code
- Setting up quality checks
- Verifying code quality
- Running tests
- Checking lint/format compliance

## Core Quality Gates

```bash
# 1. Format code (all workspaces)
npm run format

# 2. Lint code (check each product workspace)
npm run lint

# 3. Run tests
npm test

# 4. Build
npm run build
```

## Complete Quality Gate Checklist

Before committing, run:

```bash
# Step 1: Format code
npm run format

# Step 2: Lint code (must pass with no errors)
npm run lint

# Step 3: Run tests (all must pass)
npm test

# Step 4: Build (verify compilation succeeds)
npm run build

# Step 5: Commit only if all gates pass
git add <specific-files>
git commit -m "feat(module): your commit message"
```

## Quality Gate Failures

### Format Failure

```bash
$ npm run format
# Errors: files need formatting
```

**Fix:**
```bash
npm run format
# Re-run until no changes
```

### Lint Failure

```bash
$ npm run lint
# Errors: unused imports, type errors, etc.
```

**Fix:**
```bash
# Fix lint errors in the affected workspace
npm run lint -- --fix
```

**Check for Anti-Patterns:**
After linting, use `strict-linting-skill` to catch workarounds:
- Underscore variables (should be removed, not silenced)
- Unused imports/variables (should be removed)
- Suppressions without justification (should be fixed or documented)
- Empty catch blocks (should handle errors properly)

**CRITICAL:**
- All workspaces must pass lint before committing
- **NO WORKAROUNDS** - Fix root causes, don't silence errors
- Anti-patterns (underscore variables, suppressions) are forbidden

### Test Failure

```bash
$ npm test
# Errors: tests failing
```

**Fix:**
```bash
# Fix failing tests
# Re-run tests until all pass
npm test
```

### Build Failure

```bash
$ npm run build
# Errors: TypeScript compilation errors
```

**Fix:**
```bash
# Fix TypeScript errors in the affected workspace(s)
# Re-run build until all workspaces succeed
npm run build
```

## Pre-Commit Workflow

### Recommended Workflow

```bash
# 1. Make your changes
# ... edit files ...

# 2. Run quality gates
npm run format && npm run lint && npm test && npm run build

# 3. If all pass, commit
git add <specific-files>
git commit -m "feat(module): description"
```

## Common Quality Issues

### Unused Imports

```typescript
// WRONG
import { UnusedService } from './unused.service';

// CORRECT - Remove unused imports
```

### Type Errors

```typescript
// WRONG
const result: string = await service.getNumber();

// CORRECT
const result: number = await service.getNumber();
```

### Formatting Issues

```typescript
// WRONG - Inconsistent spacing
if(condition){
  doSomething();
}

// CORRECT - Formatted
if (condition) {
  doSomething();
}
```

## Checklist for Quality Gates

Before committing:

- [ ] `npm run format` - Code formatted
- [ ] `npm run lint` - No lint errors
- [ ] `npm test` - All tests pass
- [ ] `npm run build` - Build succeeds
- [ ] All quality gates pass before commit

## Related Skills

- **strict-linting-skill** - Hardcore linting rules and anti-pattern detection
- **direct-commit-skill** - Commit workflow with quality gates

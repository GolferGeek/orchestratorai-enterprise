---
name: strict-linting-skill
description: Enforce hardcore linting rules that catch anti-patterns and force proper fixes. Use when linting code, reviewing code quality, or when lint violations are found. Catches workarounds like underscore variables instead of removing unused code.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Strict Linting Skill

Enforce hardcore linting rules that catch anti-patterns and force proper fixes, not workarounds.

## When to Use This Skill

Use this skill when:
- Linting code before commits
- Reviewing code quality
- Lint violations are found
- Code review identifies anti-patterns
- Quality gates detect lint issues

## Core Principle

**NO WORKAROUNDS - FIX THE ROOT CAUSE**

Instead of working around lint errors, fix them properly:
- DON'T: Prefix unused variables with `_` to silence errors
- DO: Remove unused variables, imports, or code
- DON'T: Use `@ts-ignore` or `eslint-disable` without justification
- DO: Fix the underlying issue

## Anti-Patterns to Catch

### 1. Underscore Variables (FORBIDDEN)

**Anti-Pattern:**
```typescript
// BAD - Using underscore to silence unused variable error
function processData(data: Data, _unusedParam: string) {
  return data.value;
}

// BAD - Underscore variable instead of removing
const _unusedVar = getValue();
doSomething();
```

**Correct Fix:**
```typescript
// GOOD - Remove unused parameter
function processData(data: Data) {
  return data.value;
}

// GOOD - Remove unused variable
doSomething();
```

### 2. Unused Imports (FORBIDDEN)

**Anti-Pattern:**
```typescript
// BAD - Unused import left in code
import { UnusedService, UsedService } from './services';
```

**Correct Fix:**
```typescript
// GOOD - Remove unused import
import { UsedService } from './services';
```

### 3. TypeScript Suppressions (FORBIDDEN without justification)

**Anti-Pattern:**
```typescript
// BAD - Suppressing without reason
// @ts-ignore
const result = unsafeOperation();

// eslint-disable-next-line
const value = problematicCode();
```

**Correct Fix:**
```typescript
// GOOD - Fix the underlying issue
const result: SafeType = safeOperation();

// GOOD - Or provide justification
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
// Reason: Legacy API that will be refactored in Q2
const value = legacyApiCall();
```

### 4. Empty Catch Blocks (FORBIDDEN)

**Anti-Pattern:**
```typescript
// BAD - Silent error swallowing
try {
  riskyOperation();
} catch (_error) {
  // Ignore
}
```

**Correct Fix:**
```typescript
// GOOD - Handle error properly
try {
  riskyOperation();
} catch (error) {
  logger.error('Operation failed', error);
  // Handle appropriately
}
```

## Hardcore Linting Rules

### Rule 1: No Underscore Workarounds

**Check for:**
- Variables starting with `_` that are unused
- Parameters starting with `_` that are unused

**Action:**
- Remove the unused code instead
- If parameter is required by interface, document why

### Rule 2: Remove Unused Code

**Check for:**
- Unused imports
- Unused variables
- Unused functions
- Unused exports (unless public API)

**Action:**
- Remove unused code
- Don't comment it out "for later"
- Don't prefix with `_` to silence

### Rule 3: Fix Type Issues

**Check for:**
- `any` types (unless absolutely necessary)
- Type suppressions without justification
- Unsafe type assertions

**Action:**
- Use proper types
- Add type guards
- Document why `any` is necessary if used

### Rule 4: Handle Errors Properly

**Check for:**
- Empty catch blocks
- Ignored errors
- Silent failures

**Action:**
- Log errors appropriately
- Handle errors meaningfully
- Don't swallow exceptions

## Linting Workflow

### Step 1: Run Lint

```bash
npm run lint
```

### Step 2: Analyze Violations

For each lint error:
1. **Identify the violation type**
2. **Check if it's a workaround** (underscore, suppression, etc.)
3. **Determine the proper fix**
4. **Apply the fix** (remove, refactor, or document)

### Step 3: Fix Anti-Patterns

**Before fixing, check:**
- Is this a workaround? (underscore, suppression)
- Can the code be removed?
- Can the issue be fixed properly?

**Fix priority:**
1. Remove unused code (highest priority)
2. Fix type issues
3. Handle errors properly
4. Document if suppression is truly necessary

## Examples

### Example 1: Underscore Variable

**Found:**
```typescript
function handler(data: Data, _event: Event) {
  return process(data);
}
```

**Action:**
```typescript
// Remove unused parameter
function handler(data: Data) {
  return process(data);
}
```

### Example 2: Unused Import

**Found:**
```typescript
import { ServiceA, ServiceB, UnusedService } from './services';
```

**Action:**
```typescript
// Remove unused import
import { ServiceA, ServiceB } from './services';
```

### Example 3: Empty Catch

**Found:**
```typescript
try {
  operation();
} catch (_error) {
  // Ignore
}
```

**Action:**
```typescript
// Handle error properly
try {
  operation();
} catch (error) {
  logger.warn('Operation failed, continuing', error);
}
```

## Related Skills

- **quality-gates-skill** - Quality gate patterns
- **direct-commit-skill** - Commit workflow with quality gates

## Notes

- **Zero tolerance** for workarounds
- **Remove, don't silence** unused code
- **Fix root causes**, not symptoms
- **Document exceptions** if suppression is truly necessary

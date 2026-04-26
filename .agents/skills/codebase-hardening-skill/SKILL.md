---
name: codebase-hardening-skill
description: Patterns and validation for codebase hardening. Use when fixing issues, addressing architectural problems, or improving code quality. Keywords: hardening, auto-fix, issue fixing, architectural refactoring, code quality.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Codebase Hardening Skill

## Purpose

This skill provides patterns and validation for codebase hardening. It enables agents to determine test adequacy, safely auto-fix issues, document issues when tests are inadequate, and address architectural decisions.

## When to Use

- **Test Adequacy Checking**: When determining if tests are sufficient for safe fixes
- **Auto-Fixing**: When making automated fixes to code
- **Issue Documentation**: When documenting issues that can't be fixed yet
- **Architectural Hardening**: When addressing architectural decisions

## Core Principles

### 1. Test Adequacy Determination

**Criteria for "Adequate Tests":**
1. **Unit Tests**: Exist for affected functions/methods
2. **Integration Tests**: Exist for affected services/modules
3. **E2E Tests**: Exist for affected user flows (if applicable)
4. **Coverage Thresholds**:
   - Lines: 75%
   - Branches: 70%
   - Functions: 75%
5. **Test Quality**: Tests are meaningful (not just "should be defined")

**If Tests Adequate:**
- Auto-fix the issue
- Run tests to verify
- Commit changes

**If Tests Inadequate:**
- Document the issue
- Include fix plan
- Specify required test coverage
- Do NOT make changes

### 2. Auto-Fix Safety

**Only Fix If:**
- Tests are adequate (see criteria above)
- Tests can verify the change
- Fix maintains ExecutionContext flow
- Fix maintains A2A compliance
- Fix follows architecture patterns

**Safety Checks:**
- ExecutionContext flow maintained (execution-context-skill)
- A2A compliance maintained (transport-types-skill)
- Architecture patterns followed (architecture skills)
- Tests pass after fix
- No breaking changes

### 3. Issue Documentation

**When Tests Inadequate:**
- Document the issue clearly
- Provide detailed fix plan
- Specify required test coverage
- List implementation steps
- Identify related files

**Documentation Format:**
```markdown
# Issue #[id]: [Issue Title]

## Problem
[Detailed problem description]

## Proposed Solution
[Detailed solution approach]

## Required Test Coverage
- Unit tests: [requirements]
- Integration tests: [requirements]

## Implementation Steps
1. [Step 1]
2. [Step 2]

## Related Files
- [file1.ts]
- [file2.ts]
```

### 4. Provider Planes Hardening

**Safe Plane Fixes (if tests adequate):**
- Replace direct `SupabaseDatabaseService` injection with `@Inject(DATABASE_SERVICE)`
- Replace implementation imports with plane interface imports
- Remove `process.env.*_PROVIDER` checks from business logic
- Add missing `@Global()` to plane modules
- Remove fallback logic from plane factories

**Plane Fix Safety Checks:**
- [ ] All plane symbol injections resolve correctly after fix
- [ ] No business logic references specific provider classes
- [ ] Factory modules still throw on unsupported providers (no fallbacks)
- [ ] `@Global()` decorator present on all plane modules
- [ ] Tests verify behavior with the default provider configuration
- [ ] LangGraph agents still use HTTP boundary (no direct plane imports)

**Plane Refactoring Pattern:**
When migrating a service from direct Supabase usage to plane abstraction:
1. Identify all `SupabaseDatabaseService` (or similar) injections in the service
2. Replace with `@Inject(DATABASE_SERVICE) db: DatabaseService`
3. Update imports to use `@/planes/database` instead of implementation path
4. Verify the service only uses interface methods (not provider-specific methods)
5. Run tests to confirm behavior unchanged

## Auto-Fix Patterns

### Pattern 1: Code Smell Fixes

**If Tests Adequate:**
- Fix long methods (extract functions)
- Fix deep nesting (refactor logic)
- Fix code duplication (extract common code)
- Fix poor naming (rename for clarity)

**Safety:**
- Run tests after each fix
- Verify behavior unchanged
- Maintain patterns

### Pattern 2: Architecture Fixes

**If Tests Adequate:**
- Fix misplaced files (move to correct location)
- Fix layer violations (move logic to correct layer)
- Fix missing abstractions (create interfaces)
- Fix tight coupling (introduce dependency injection)

**Safety:**
- Maintain ExecutionContext flow
- Maintain A2A compliance
- Follow architecture patterns
- Run tests after fix

### Pattern 3: Security Fixes

**If Tests Adequate:**
- Fix exposed secrets (move to environment variables)
- Fix unsafe operations (add validation)
- Fix missing authentication (add auth checks)
- Fix vulnerable dependencies (update dependencies)

**Safety:**
- Verify security improvement
- Run security tests
- Document security changes

## Documentation Patterns

### Issue Documentation Structure

```markdown
# Issue #[id]: [Issue Title]

## Problem
[Detailed problem description]

## Proposed Solution
[Detailed solution approach]

## Required Test Coverage
- Unit tests: [requirements]
- Integration tests: [requirements]
- E2E tests: [requirements if applicable]

## Implementation Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Related Files
- [file1.ts]
- [file2.ts]
```

## Related

- **`codebase-monitoring-skill/`** - For finding issues to harden
- **`execution-context-skill/`** - ExecutionContext patterns and validation
- **`transport-types-skill/`** - A2A compliance patterns
- **`planes-architecture-skill/`** - Provider Planes patterns and validation

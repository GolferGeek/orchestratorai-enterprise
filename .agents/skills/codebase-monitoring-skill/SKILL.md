---
name: codebase-monitoring-skill
description: Patterns and validation for codebase monitoring. Use when analyzing files, evaluating codebase health, identifying issues, or generating monitoring reports. Keywords: monitoring, file analysis, issue detection, codebase health, hierarchical analysis.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Codebase Monitoring Skill

## Purpose

This skill provides patterns and validation for codebase monitoring. It enables agents to analyze files hierarchically, evaluate codebase health, identify issues, and generate comprehensive monitoring reports.

## When to Use

- **File Analysis**: When analyzing individual files for purpose, performance, and issues
- **Hierarchical Analysis**: When evaluating folder structures and their compliance
- **Issue Detection**: When identifying code smells, violations, and problems
- **Report Generation**: When creating monitoring artifacts

## Core Principles

### 1. File Purpose Analysis

**Understand What File Does:**
- Read file content
- Identify main exports/classes/functions
- Understand file's role in system
- Determine file's responsibility

**Pattern:**
- Component files: UI rendering, user interaction
- Service files: Business logic, API calls
- Store files: State management
- Controller files: Request handling
- Module files: Dependency injection configuration

### 2. Job Performance Evaluation

**Is File Doing Its Job Well?**
- Code quality assessment
- Best practices compliance
- Maintainability evaluation
- Performance considerations

**Indicators:**
- Clean, readable code
- Follows patterns and conventions
- Proper error handling
- Good separation of concerns
- Code smells (long methods, deep nesting) are negatives
- Violations of patterns are negatives

### 3. Issue Detection

**Types of Issues to Detect:**

**Architectural Issues:**
- Violations of architectural patterns
- Misplaced files
- Incorrect layer usage
- Missing abstractions

**Security Issues:**
- Vulnerable dependencies
- Unsafe data handling
- Missing authentication/authorization
- Exposed secrets

**Performance Issues:**
- Inefficient algorithms
- Unnecessary re-renders
- Missing caching
- Large bundle sizes

**Maintainability Issues:**
- Code duplication
- Complex logic
- Poor naming
- Missing documentation

**Testing Issues:**
- Missing tests
- Low test coverage
- Poor test quality

### 4. Urgency Classification

**High Urgency:**
- Security vulnerabilities
- Data loss risks
- Critical bugs
- Breaking changes

**Medium Urgency:**
- Maintainability issues
- Architectural problems
- Code smells
- Performance concerns

**Low Urgency:**
- Style issues
- Minor optimizations
- Documentation gaps
- Code cleanup

### 5. Test Coverage Analysis

**Check Test Completeness:**
- Does test file exist?
- What is the coverage percentage?
- Are critical paths tested?
- Is test quality adequate?

**Coverage Thresholds:**
- Lines: 75% (adequate)
- Branches: 70% (adequate)
- Functions: 75% (adequate)
- Critical paths: 85% (required)

### 6. Provider Planes Compliance

**Check Plane Abstraction Adherence:**
- Services use `@Inject(SYMBOL)` for infrastructure, not direct class injection
- Imports come from `@/planes/[plane]`, not from implementation files
- No `process.env.*_PROVIDER` reads outside factory modules
- Business logic does not reference specific providers

**Plane-Specific Issue Types:**

| Issue | Severity | Description |
|-------|----------|-------------|
| Direct provider injection | High | Service injects `SupabaseDatabaseService` instead of `@Inject(DATABASE_SERVICE)` |
| Implementation import | High | Business logic imports from `planes/[plane]/[provider]-*.service.ts` |
| Provider env check in service | Medium | Service reads `process.env.DB_PROVIDER` outside factory module |
| Missing @Global on plane module | High | Plane module missing `@Global()` decorator |
| Plane factory has fallback | High | Factory catches errors and falls back instead of throwing |

### 7. Location Validation

**Should File Be Moved?**
- Check file location against architecture
- Verify file is in correct directory
- Identify misplaced files

## Report Generation Patterns

### File Entry Structure

**Required Fields:**
- `monitoredDate`: When file was analyzed
- `purpose`: What file does
- `jobPerformance`: How well it performs
- `issues`: Array of issues
- `testCoverage`: Test coverage data
- `necessity`: Is file necessary
- `location`: Is location correct

### Issue Entry Structure

**Required Fields:**
- `id`: Unique issue ID
- `type`: Issue type (architectural, security, etc.)
- `severity`: Severity level (high, medium, low)
- `urgency`: Urgency level (high, medium, low)
- `description`: Issue description
- `location`: Where issue is (line numbers, etc.)

## Hierarchical Analysis Patterns

### Folder Intent Analysis

**Understand Folder Purpose:**
- What is this folder supposed to contain?
- What is the architectural role?
- What file types are expected?

### Intent Compliance

**How Well Is Intent Met?**
- Do files match folder intent?
- Are there misplaced files?
- Is folder organization correct?

### Folder-Level Issues

**Aggregate File-Level Issues:**
- Collect issues from all files in folder
- Identify folder-level problems
- Check for missing patterns/files

## Related

- **`codebase-hardening-skill/`** - For fixing issues found during monitoring
- **`execution-context-skill/`** - For ExecutionContext validation
- **`transport-types-skill/`** - For A2A compliance validation
- **`planes-architecture-skill/`** - For Provider Planes compliance validation

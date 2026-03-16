---
name: skill-builder-skill
description: Guide creation of new Claude Code Skills following best practices and patterns. Use when creating new skills, extending Claude's capabilities, or packaging domain expertise into reusable skills. Keywords: create skill, build skill, new skill, skill creation, skill development.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Skill Builder Skill

## Purpose

This skill guides the creation of new Claude Code Skills, ensuring they follow best practices, proper structure, and integration patterns. It helps package domain expertise into discoverable, composable capabilities.

## When to Use

- **Creating New Skills**: When building a new skill from scratch
- **Extending Skills**: When adding capabilities to existing skills
- **Refactoring Skills**: When restructuring or improving skills
- **Validating Skills**: When checking if a skill follows best practices

## Core Principles

### 1. Progressive Disclosure

**Three Levels of Loading:**
1. **Metadata** (always loaded): `name` and `description` in YAML frontmatter
2. **Instructions** (loaded when triggered): Main body of SKILL.md
3. **Resources** (loaded as needed): Additional files, scripts, templates

**Key Principle:** Only relevant content enters the context window at any time.

### 2. Skill Discovery

**Description is Critical:**
- Must include **what it does** AND **when to use it**
- Include trigger keywords/phrases
- Be specific, not vague
- Max 1024 characters

**Example Good Description:**
```
"Classify web files and validate against Vue.js web application patterns. Use when working with Vue components, stores, services, composables, views, or any web application code."
```

**Example Bad Description:**
```
"Helps with web code"
```

## Skill Creation Workflow

### Step 1: Define Purpose and Scope

**Ask These Questions:**
1. What task or domain should this skill cover?
2. When should Claude use this skill? (triggers)
3. What expertise or workflows need to be captured?
4. Does it need scripts, templates, or other resources?
5. What type of skill is it? (architecture, development, utility, etc.)

### Step 2: Choose Skill Type and Structure

**Skill Types:**

**Architecture Skills** (Classification & Validation):
- Classify files and validate patterns
- Examples: `web-architecture-skill`, `api-architecture-skill`
- Structure: `SKILL.md`, `FILE_CLASSIFICATION.md`, `PATTERNS.md`, `VIOLATIONS.md`

**Development Skills** (Prescriptive Patterns):
- Provide prescriptive patterns for building
- Examples: `langgraph-development-skill`
- Structure: `SKILL.md`, `PATTERNS.md`, `CONSTRUCTS.md`, `VIOLATIONS.md`

**Utility Skills** (Operations & Workflows):
- Handle specific operations or workflows
- Examples: `direct-commit-skill`, `quality-gates-skill`
- Structure: `SKILL.md`, `REFERENCE.md`, `EXAMPLES.md`

**Testing Skills** (Test Patterns):
- Provide testing patterns and validation
- Examples: `web-testing-skill`, `api-testing-skill`, `e2e-testing-skill`
- Structure: `SKILL.md`, test patterns, E2E principles

### Step 3: Create Directory Structure

**Create skill directory:**
```bash
mkdir -p .claude/skills/<skill-name>
```

**Naming Conventions:**
- Use lowercase with hyphens (e.g., `pdf-processing`, `data-analysis`)
- Be descriptive but concise
- Match existing patterns (e.g., `*-architecture-skill`, `*-development-skill`)

**Standard Structure:**
```
skill-name/
├── SKILL.md                    # Main instructions (REQUIRED)
├── PATTERNS.md                 # Patterns (if needed)
├── VIOLATIONS.md               # Violations (if needed)
└── EXAMPLES.md                 # Examples (if needed)
```

### Step 4: Write SKILL.md with YAML Frontmatter

**Required Frontmatter:**
```yaml
---
name: Your Skill Name
description: Brief description of what this Skill does and when to use it. Include trigger keywords.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---
```

**Frontmatter Requirements:**
- `name`: Required, max 64 characters
- `description`: Required, max 1024 characters
  - Include BOTH what it does AND when to use it
  - Mention key trigger words/phrases
  - Be specific, not vague
- `allowed-tools`: Optional, restrict which tools Claude can use

**SKILL.md Structure:**
```markdown
# Skill Name

## Purpose

This skill [what it does and why it exists].

## When to Use

- **Trigger 1**: When [specific situation]
- **Trigger 2**: When [specific situation]

## Core Principles

### 1. Principle Name
[Explanation]

## Workflow

### 1. Step Name
[Detailed instructions]

## Related

- **`related-skill/`** - Related skill
```

### Step 5: Validate Skill Structure

**Checklist:**
- [ ] YAML frontmatter is valid
- [ ] `name` is 64 characters
- [ ] `description` is 1024 characters and includes triggers
- [ ] `SKILL.md` has clear Purpose and When to Use sections
- [ ] Workflow is clear and actionable
- [ ] All referenced files exist

## Best Practices

### Description Writing

**Good Examples:**
- "Classify web files and validate against Vue.js web application patterns. Use when working with Vue components, stores, services, composables, views, or any web application code."
- "Patterns and validation for codebase monitoring. Use when analyzing files, evaluating codebase health, identifying issues, or generating monitoring reports."

**Bad Examples:**
- "Helps with web code"
- "Monitoring stuff"

### Instruction Organization

- Keep main instructions focused (under 5k tokens ideal)
- Split complex content into linked files
- Use progressive disclosure for optional/advanced content

### Skill Scope

- One skill = one capability or workflow
- Don't combine unrelated tasks
- Make focused, composable skills
- Skills can reference each other

## Related

- **`agent-builder-skill/`** - For creating agents that use skills
- **`execution-context-skill/`** - Mandatory cross-cutting skill to reference
- **`transport-types-skill/`** - Mandatory cross-cutting skill to reference

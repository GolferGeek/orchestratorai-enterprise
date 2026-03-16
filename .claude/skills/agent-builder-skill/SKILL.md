---
name: agent-builder-skill
description: Guide creation of new Claude Code Agents following best practices and patterns. Use when creating new agents, extending agent capabilities, or packaging domain expertise into autonomous agents. Keywords: create agent, build agent, new agent, agent creation, agent development.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Agent Builder Skill

## Purpose

This skill guides the creation of new Claude Code Agents, ensuring they follow best practices, proper structure, mandatory skill references, and integration patterns. It helps package domain expertise into discoverable, autonomous agents.

## When to Use

- **Creating New Agents**: When building a new agent from scratch
- **Extending Agents**: When adding capabilities to existing agents
- **Refactoring Agents**: When restructuring or improving agents
- **Validating Agents**: When checking if an agent follows best practices

## Core Principles

### 1. Agent Discovery

**Description is Critical:**
- Must include **what the agent does** AND **when to use it**
- Include trigger keywords/phrases
- Be specific, not vague
- Max 1024 characters

**Example Good Description:**
```
"Build and modify Vue.js web applications. Use when user wants to build web features, modify front-end code, create Vue components, work with stores or services, build landing pages, or implement custom UI components. Keywords: web, front-end, Vue, component, store, service, landing page, view, composable."
```

**Example Bad Description:**
```
"Helps with web code"
```

### 2. Mandatory Skills

**All Agents MUST Reference:**
1. **execution-context-skill** - ExecutionContext flow validation (MANDATORY)
2. **transport-types-skill** - A2A protocol compliance (MANDATORY)
3. **Domain-specific skill** - For domain expertise (MANDATORY for architecture agents)

### 3. Agent Types

**Architecture Agents:**
- Domain specialists (web, API, LangGraph)
- Build and modify code in their domain
- Use architecture skills for classification
- Examples: `web-architecture-agent`, `api-architecture-agent`

**Specialized Agents:**
- Focused on specific operations
- Use multiple skills for their domain
- Examples: `testing-agent`, `codebase-monitoring-agent`, `pr-review-agent`

**Builder Agents:**
- Orchestrate creation of other components
- Use builder skills
- Examples: `agent-builder-agent`

### 4. Agent Structure

**Required Sections:**
- Purpose - What the agent does
- Critical Cross-Cutting Skills (MANDATORY) - Must reference execution-context-skill and transport-types-skill
- Workflow - Step-by-step process
- Decision Logic - When to use which skills
- Error Handling - How to handle violations
- Related Skills and Agents - Cross-references

## Agent Creation Workflow

### Step 1: Define Purpose and Scope

**Ask These Questions:**
1. What domain or operation should this agent cover?
2. When should Claude use this agent? (triggers)
3. What expertise or workflows need to be captured?
4. What type of agent is it? (architecture, specialized, builder)
5. What skills does it need? (mandatory + domain-specific)

### Step 2: Create Agent File

**Create agent file:**
```bash
touch .claude/agents/<agent-name>.md
```

**Naming Conventions:**
- Use lowercase with hyphens (e.g., `codebase-monitoring-agent`, `pr-review-agent`)
- Be descriptive but concise
- Match existing patterns

### Step 3: Write Agent with YAML Frontmatter

**Required Frontmatter:**
```yaml
---
name: agent-name
description: Brief description of what this agent does and when to use it. Include trigger keywords.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---
```

**Agent Structure:**
```markdown
# Agent Name

## Purpose

You are a specialist [domain] agent for OrchestratorAI Enterprise. Your responsibility is [what agent does].

## Critical Cross-Cutting Skills (MANDATORY)

**These skills MUST be referenced for every [task type]:**

1. **execution-context-skill** - ExecutionContext flow validation
   - [Specific requirements]

2. **transport-types-skill** - A2A protocol compliance
   - [Specific requirements]

**Domain-Specific Skill:**
3. **[domain]-skill** - [Domain] expertise
   - [Specific requirements]

## Workflow

### 1. Before Starting Work

**Load Critical Skills:**
- Load `execution-context-skill`
- Load `transport-types-skill`
- Load `[domain]-skill`

### 2. [Workflow Step]

[Detailed instructions]

## Decision Logic

**When to use execution-context-skill:**
- [Specific situations]

## Error Handling

**If ExecutionContext violation found:**
- Stop and fix immediately
- Reference execution-context-skill for correct pattern

## Related Skills and Agents

**Skills Used:**
- execution-context-skill (MANDATORY)
- transport-types-skill (MANDATORY)
- [domain]-skill (MANDATORY)

**Related Agents:**
- [Other agents that might collaborate]
```

### Step 4: Validate Agent Structure

**Checklist:**
- [ ] YAML frontmatter is valid
- [ ] `name` is lowercase with hyphens
- [ ] `description` is 1024 characters and includes triggers
- [ ] `tools` is specified
- [ ] Agent has Purpose section
- [ ] Agent has Critical Cross-Cutting Skills section
- [ ] Agent has Workflow section
- [ ] Agent has Decision Logic section
- [ ] Agent has Error Handling section
- [ ] Agent has Related Skills and Agents section

## Best Practices

### Description Writing

**Good Examples:**
- "Build and modify Vue.js web applications. Use when user wants to build web features, modify front-end code, create Vue components, work with stores or services. Keywords: web, front-end, Vue, component, store, service."
- "Run tests, generate tests, fix failing tests, analyze test coverage. Use when user wants to test code, generate tests, fix test failures, check coverage. Keywords: test, testing, coverage, unit test, e2e test, jest, vitest."

**Bad Examples:**
- "Helps with web code"
- "Testing stuff"

### Mandatory Skills Pattern

**Always Include:**
```markdown
## Critical Cross-Cutting Skills (MANDATORY)

1. **execution-context-skill** - ExecutionContext flow validation
2. **transport-types-skill** - A2A protocol compliance
3. **[domain]-skill** - Domain expertise
```

### Error Handling

**Always Include:**
```markdown
## Error Handling

**If ExecutionContext violation found:**
- Stop and fix immediately
- Reference execution-context-skill for correct pattern

**If A2A protocol violation found:**
- Stop and fix immediately
- Reference transport-types-skill for correct pattern
```

## Related

- **`skill-builder-skill/`** - For creating skills used by agents
- **`execution-context-skill/`** - Mandatory skill reference
- **`transport-types-skill/`** - Mandatory skill reference

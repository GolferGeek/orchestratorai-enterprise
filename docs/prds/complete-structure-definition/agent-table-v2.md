# Agent Table V2

## Purpose

Define the simplified agent-definition table for Compose after removing old generalized framework baggage.

## Core Definition

`agent table v2` should model a **single-action agent definition**.

It should support Compose's five simple families:

- `context`
- `rag`
- `api`
- `external`
- `media`

It should not try to preserve the old generalized framework model that assumed multi-action agents, plan/build mode logic, or broad protocol configuration.

## Design Goals

The table should be:

- simple to understand
- fast to use for database-defined agents
- aligned to A2A invocation
- aligned to typed outputs
- compatible with code-defined extensions where needed
- free of old framework-era fields that no longer carry product value

## Single-Action Rule

Each row should represent one agent with one action surface.

That means:

- no multi-action routing in the definition
- no embedded tool registry model
- no generalized action matrix
- no attempt to turn the table into a workflow engine

If a future product needs multi-step orchestration, that belongs in product logic, not in the Compose agent table.

## Core Fields To Keep

The v2 table should keep fields that directly support simple agent definition and execution.

### Identity And Governance

- `id`
- `slug`
- `name`
- `description`
- `agent_type`
- `status`

### Compose Agent Definition

- `context`
- family-specific definition fields such as endpoint or collection configuration where needed
- `llm_config`
- `output_type`

### Ownership And Auditing

- timestamps
- creator/updater fields if already part of the platform standard
- org scoping fields if required by the existing tenancy model

## Meaning Of Key Fields

### `agent_type`

This should identify the Compose family:

- `context`
- `rag`
- `api`
- `external`
- `media`

It should drive runner selection and governance.

### `context`

`context` should stay.

This is especially important for:

- context agents
- RAG-adjacent agents that still need static context
- agents whose behavior depends on a compact default instruction or knowledge payload

There is no better default place for this information in the simplified model.

### `llm_config`

`llm_config` should stay as the per-agent default provider/model configuration.

This allows an agent to declare its preferred LLM behavior while still permitting higher-level system or user override where appropriate.

The rule should be:

- agent definition supplies the default
- the runtime may allow explicit override
- absence of override means the agent default applies

### `output_type`

`output_type` should be explicit.

Examples include:

- `text`
- `markdown`
- `json`
- `image`
- `video`
- `audio`

This is a core part of the simplified model because frontend rendering and downstream agent behavior should be driven by typed outputs rather than old mode semantics.

## Family-Specific Fields

The table can include simple family-specific configuration where needed.

Examples:

- `collection_slug` for `rag`
- `endpoint` or equivalent remote target field for `api`
- auth configuration for `api` when needed
- remote descriptor/card reference for `external`
- media provider or media generation config for `media`

These should remain lightweight and intentional.

## Fields To Remove

The v2 table should remove fields that only exist to support the older generalized framework model.

That includes:

- `io_schema`
- version-heavy framework fields where they only supported the old lifecycle model
- multi-action fields
- protocol-specific fields in the default Compose definition
- old mode-specific configuration fields

## `io_schema`

`io_schema` should be removed from the core Compose agent table.

The simplified platform direction is:

- one invoke contract
- one typed output declaration
- lightweight family configuration

Compose should not require every simple agent to carry a heavyweight schema contract in the database just to participate in the system.

If deeper schema validation is needed later for a particular product capability, it should be added intentionally rather than preserved as default baggage.

## Protocol Fields

The default Compose agent table should not include protocol fields such as:

- `protocol_preset`
- `protocol_config`
- generalized discovery negotiation fields

Compose is not a protocol playground.

The platform already has a shared A2A direction. Bridge owns the richer external protocol surface. Compose should keep its definition model focused on simple agent behavior.

## Versioning And Lifecycle Baggage

The table should not preserve old framework lifecycle concepts just because they existed before.

If old fields only made sense in a system centered around:

- plans
- versions
- deliverable workflows
- generalized build/converse branching

then those fields should be removed from the simplified Compose definition model.

## Relationship To Transport Types

The table should align to `transport-types v2` by supporting:

- one invoke path
- one execution context model
- one typed output declaration

It should not embed transport semantics that belong in the shared contract.

## Relationship To Execution Context

The agent table should not attempt to duplicate execution identity.

Execution identity belongs in `ExecutionContext v2`.

The table defines the agent.

The execution context defines the invocation instance.

## Relationship To Persistence Simplification

The agent table survives as a useful definition model.

The old generalized workflow tables do not.

Compose should keep:

- the agent definition table
- the conversation-centric persistence model

Compose should remove old framework-era persistence tables such as:

- `tasks`
- `deliverables`
- `plans`
- `versions`

The simplified architecture is not "delete the database." It is "keep the right tables and remove the wrong ones."

## Proposed Direction

The exact SQL shape can be finalized later, but the direction should be:

```typescript
interface AgentTableV2Record {
  id: string;
  slug: string;
  name: string;
  description?: string;
  agentType: 'context' | 'rag' | 'api' | 'external' | 'media';
  status: 'draft' | 'active' | 'disabled' | 'archived';
  context?: string;
  llmConfig?: Record<string, unknown>;
  outputType: 'text' | 'markdown' | 'json' | 'image' | 'video' | 'audio';
  // lightweight family-specific fields live here as needed
}
```

This is illustrative, not a final SQL schema.

## Design Principles

1. One row represents one single-action agent.
2. Keep the table definition-first.
3. Keep the table family-oriented.
4. Keep the table aligned to typed outputs.
5. Remove fields that only support the old generalized framework.

## Success Criteria

- the table supports the five Compose families cleanly
- `context` remains part of the model
- `llm_config` remains as the per-agent default
- `output_type` is explicit
- `io_schema` is removed
- protocol-specific fields are not part of the default Compose definition
- the table remains single-action
- the simplified architecture keeps the agent table while removing legacy tables such as `tasks`, `deliverables`, `plans`, and `versions`

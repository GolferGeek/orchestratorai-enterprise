# Compose Structure

## Purpose

Define the target structure for Compose as a lightweight runtime for simple, composable agent families.

## Core Definition

Compose should be treated as a **definition-first runtime for simple agent families**, not as a mini-Forge and not as a leftover general-purpose framework.

The core value of Compose is that a useful agent can be created quickly from a lightweight definition.

Compose is special because its best agents are simple:

- context
- rag
- api
- external
- media

These are not five large product domains. They are five simple execution families.

## Compose Owns

Compose should own:

- simple agent-family runtimes
- lightweight composition/orchestration of those families
- agent definitions and descriptors
- simple execution paths for user-configured or code-defined agents
- the minimum shared infrastructure needed to run those families well

## Compose Consumes

Compose should consume:

- shared planes
- shared protocol packages only insofar as they support the platform's A2A contract
- transport-types only where they still provide useful shared contracts
- a simplified execution or invocation model

Compose should not continue carrying broad inherited technical debt from a more general platform architecture.

Compose should be treated as:

- A2A-native
- single-action by default
- not a generalized protocol playground

## Definition-First Model

Compose should be **database-defined by default**.

That is the product’s magic: a user or operator can create a useful agent quickly by defining it in data instead of writing a new custom code module.

Examples:

- a context agent with a `context` field
- a RAG agent with a `collectionSlug`
- an API agent with an endpoint, auth config, and response wrapper
- an external agent with a card or descriptor
- a media agent with provider and output options

This is the default model Compose should preserve.

## Code-Defined Extensions

Compose should also support **code-defined simple agents** when configuration is not enough.

These are for cases such as:

- custom auth handshake
- custom payload transform
- custom response shaping
- unusual remote integration behavior
- special media workflow needs

So the correct model is:

- declarative by default
- coded when necessary

## Agent Family Model

Compose should be organized around five first-class families:

1. `context`
2. `rag`
3. `api`
4. `external`
5. `media`

Each family should have:

- a runtime implementation
- a definition schema
- a descriptor or card model where appropriate
- a predictable input/output contract

Each agent should remain **single-action**. Compose should not introduce multi-action or multi-tool agent expansion as part of this architecture.

## Shared Descriptor Direction

API and external agents especially should be treated as descriptor-driven.

In many cases, the “agent” is mostly:

- where it lives
- how to call it
- what auth it needs
- what kind of thing it is
- what protocol or preset it expects

So Compose should likely adopt a shared concept such as:

- `AgentDefinition`
- `CapabilityCard`
- `RemoteCapabilityDescriptor`

The exact name can be decided later, but the pattern should be standard.

## Agent Table Direction

Compose should simplify its agent definition model rather than preserve generalized framework-era fields.

The Compose-facing definition model should:

- keep `context`
- keep `llm_config` as the per-agent default provider/model configuration
- keep endpoint-style configuration for `api` and `external` families
- add an explicit `output_type`
- avoid `io_schema` as a core requirement
- avoid protocol-specific fields in the default Compose agent definition

`llm_config` should define the agent's default provider/model behavior even when the overall system has different defaults. The frontend may still allow user override, but the agent definition should be authoritative when no override is chosen.

## Compose Runtime Shape

Compose should move toward this shape:

1. a request arrives through an approved transport
2. the request resolves to an agent definition
3. the system identifies the agent family
4. the corresponding family runtime executes
5. an optional composition layer chains simple outputs together
6. the result is mapped back through the selected transport

The principles are:

- definition-first
- family-based execution
- lightweight composition
- protocol-wrapped at the edge

## Compose And The Old `agents/` Idea

Historically, Compose used an `agents` concept to hold custom logic.

That still has value, but it should be reinterpreted:

- not as a place for arbitrary platform complexity
- not as a place to rebuild Forge inside Compose
- but as the extension surface for code-defined simple agents

In other words, Compose can still have a code-backed extension mechanism, but its center of gravity should stay with simple families and lightweight definitions.

## Compose And Current Technical Debt

The current Compose app still carries a lot of generalized framework machinery, including broad `agent2agent` and `agent-platform` structures, conversation/task/deliverable handling, and other inherited platform concerns.

There is also drift between intent and reality. For example, the current Compose product guidance still talks about an `agents/` directory, but the current `apps/compose/api/src` layout is dominated by general platform modules instead of a clear family-first Compose structure.

That is exactly the kind of debt this rewrite should remove.

## Typed Output Instead Of Heavy Modes

Compose should move away from a heavy mode-first model built around `converse`, `plan`, `build`, tasks, and deliverables.

The simpler contract is:

- one invocation
- one response envelope
- one declared output type

What matters most for Compose is:

- what the agent receives
- what it returns
- how the UI renders it
- whether the next agent can consume it

That means the likely direction is:

- reduce or remove most mode-specific branching
- prefer typed outputs over framework-style execution modes
- treat persistence as optional rather than universal

Examples of output types:

- `text`
- `markdown`
- `json`
- `image`
- `video`
- `audio`
- optional future artifact references

For Compose, frontend rendering should be driven by `outputType`, not by backend mode semantics.

That means the UI can stay very simple:

- `text` -> normal conversation rendering
- `markdown` -> preview with an optional `See Markdown` or edit toggle
- `json` -> friendly visual rendering with a `See JSON` toggle
- `image` -> image preview
- `video` -> video preview
- `audio` -> audio preview

## Conversation-Centric Persistence

Compose should simplify persistence so that **conversation is the primary persisted unit**.

Instead of automatically creating separate conversation, task, and deliverable abstractions for every run, Compose should default to:

- storing messages in a conversation
- keeping output as part of that conversation history
- letting the UI render or edit typed content inline
- letting the user explicitly save or export something if they want durable artifact behavior

This could be implemented as:

- normalized message rows
- or a larger conversation payload structure
- or a conversation-linked JSON document

The exact storage model can be decided later, but the architectural rule should be:

- keep the conversation
- do not create extra state objects unless they are justified

## Tasks And Deliverables

Tasks and deliverables should stop being default Compose architecture.

They should only exist where they provide clear value:

- async execution tracking for a truly long-running operation
- durable artifact storage for something like generated media or exported files

That means:

- no universal task creation
- no universal deliverable creation
- no assumption that every agent call becomes a managed backend artifact

For most Compose flows, the user can simply:

- see the result in the conversation
- edit it if it is text/markdown/json
- choose whether to save/export it

## Compose Simplification Direction

The likely outcome is:

- conversation remains
- tasks become optional and rare
- deliverables become optional and artifact-specific
- mode-heavy execution shrinks into a simpler typed-output model
- agent definitions stay simple and single-action
- old generalized persistence tables are removed rather than preserved by default

## Protocol Direction

Compose should consume a much narrower protocol subset than Bridge.

For its core architecture, Compose should assume:

- A2A is the transport model
- JWT/auth/PII/HTTPS still apply as platform requirements
- advanced protocol composition is out of scope
- streaming, where used, should flow through the observability plane rather than product-local event plumbing

Compose should not become a protocol playground, and it should not carry generalized protocol configuration fields unless a future requirement clearly justifies them.

## Rewrite Implications

The Compose rewrite should:

- simplify generalized framework layers
- keep the five-family model front and center
- preserve fast creation through database definitions
- allow code-defined extensions where useful
- reduce mode, conversation, task, and deliverable complexity where that complexity is not product value
- remove legacy framework-era tables such as `tasks`, `deliverables`, `plans`, and `versions` once the conversation-centric model is in place
- move product-local infrastructure concerns into shared packages where appropriate

## Structural Questions

The Compose rewrite should answer:

1. What is the authoritative schema for a simple agent definition?
2. What is the right shared descriptor model for API and external agents?
3. Which current generalized modules should be removed outright?
4. What is the minimum useful typed-output model for simple agent execution?
5. Which families truly need more than conversation persistence?
6. What belongs in code-defined extensions versus database-defined agents?
7. Which existing agent-table fields should be removed because they only support old generalized framework behavior?

## Success Criteria

- Compose is explicitly modeled as a definition-first runtime for simple agent families
- Compose preserves rapid creation of useful agents from lightweight definitions
- Compose supports code-defined extensions without losing its simple center
- Compose uses conversation as the primary persisted unit
- Compose is explicitly A2A-native and single-action by default
- Compose carries only the execution state machinery it actually needs
- Compose does not preserve broad inherited technical debt just because it existed first

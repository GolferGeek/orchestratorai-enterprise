# Flow Structure

## Purpose

Define the target structure for Flow as the platform's productivity product with clean boundaries from agent execution and infrastructure sprawl.

## Core Definition

Flow should be treated as a **productivity application**, not as an agent runtime and not as a place to re-embed LLM infrastructure just because productivity features may eventually call AI services.

Flow owns work-management behavior such as:

- tasks
- lists
- sprints
- files
- collaboration views

## Flow Owns

Flow should own:

- productivity data models and UX
- org-scoped workflow and collaboration state
- task, sprint, list, and collaboration domain behavior
- file and note experiences that belong to productivity
- the user-facing product experience for work management

## Flow Consumes

Flow should consume:

- the relevant database plane for persistence
- Auth for authentication and authorization
- Auth for canonical organization and team structure
- shared `transport-types` contracts such as `ExecutionContext`
- shared UI where that reduces duplication
- Compose or Forge as clients if Flow intentionally offers AI-powered productivity features

Flow should not absorb product-local infrastructure copies if shared planes already exist.

## Domain Direction

Flow should remain domain-first:

- productivity data is primary
- agent assistance is secondary and compositional
- AI should be called as a product integration, not embedded as Flow's base architecture

That means Flow should avoid drifting into a hidden agent product.

## Data Direction

Flow should be org-scoped and schema-disciplined.

The architectural expectation is:

- all Flow data is scoped by `ExecutionContext.orgSlug`
- Flow writes to the schemas and tables that actually belong to the productivity product
- Flow does not become a general-purpose home for unrelated platform state

## What Flow Does Not Own

Flow should not own:

- JWT issuance or identity policy
- agent execution runtimes
- LangGraph workflow infrastructure
- ambient automation
- external A2A routing
- copied plane implementations

If Flow needs AI behavior, it should invoke the right product rather than reimplement the stack locally.

If Flow needs teams for assignment, collaboration, permissions, or navigation, it should consume the canonical team model from Auth rather than owning a competing source of truth.

## Runtime Direction

The desired Flow shape is:

1. authenticated user enters Flow
2. Flow resolves org-scoped productivity state
3. Flow performs product-local CRUD and collaboration behavior
4. optional AI features call the appropriate agent product through the shared contracts

## Rewrite Implications

The Flow cleanup should:

- preserve Flow as a clear productivity product
- remove any infrastructure duplication that belongs in shared planes
- keep auth concerns delegated to Auth
- consume canonical org and team structure from Auth rather than duplicating it locally
- keep agent concerns delegated to Compose or Forge
- keep the data model explicit and org-scoped

## Structural Questions

The Flow structure should answer:

1. Which current Flow capabilities are purely productivity and which are actually agent concerns?
2. Which local infrastructure dependencies should move to shared planes?
3. How should optional AI productivity features call Compose or Forge without turning Flow into an agent runtime?
4. Which schemas, services, and UI surfaces belong cleanly inside Flow long-term?

## Success Criteria

- Flow is explicitly modeled as the productivity product
- Flow consumes relevant shared planes instead of carrying local infrastructure copies
- Flow delegates auth and canonical team ownership to Auth and AI execution to the appropriate products
- Flow stays org-scoped, data-disciplined, and intentionally simple
- Flow remains lean, clean, and professionally bounded

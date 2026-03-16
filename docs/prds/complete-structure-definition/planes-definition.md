# Planes Definition

## Purpose

Define what a `plane` is in OrchestratorAI Enterprise and what does or does not belong in `packages/planes`.

## Core Definition

A `plane` is a shared infrastructure abstraction that allows the platform codebase to remain portable across deployment environments.

Planes are for:

- deployment portability
- provider abstraction
- shared operational concerns
- product-independent infrastructure contracts

Planes are **not** for:

- product-specific business logic
- UI behavior
- domain workflows
- arbitrary runtime mixing of providers in a normal client deployment

## Operating Assumption

The platform must support multiple infrastructure environments across versions of the product:

- Supabase/local
- Azure
- GCP

But a normal client deployment usually chooses one provider stack per concern and stays there.

So planes should optimize for:

- one codebase
- provider substitution by configuration
- minimal product coupling

They should not optimize for:

- complex multi-provider runtime composition by default

## Plane Membership

### Core Planes

These belong in the core plane set:

- `database`
- `llm`
- `storage`
- `config`
- `rag`
- `observability`

See `observability-plane-definition.md`.

### Auth As A Plane Concern

`auth` belongs in planes only to the extent that it provides shared provider abstractions, such as:

- identity provider interfaces
- provider-specific validation adapters
- claims normalization
- shared auth-provider contracts

The auth plane does **not** replace the `Auth` app.

### Candidates Requiring Explicit Proof

These should not be treated as core planes until they are proven to be truly cross-product infrastructure:

- `work-routing`
- `workflow`

## Explicit Non-Members

These should not be treated as top-level planes:

- `supabase-core`
- product-local orchestration modules
- app-specific auth flows
- app-specific controllers
- app-specific persistence logic that only exists because a product has not yet been cleaned up

`supabase-core` can remain an implementation detail used by actual planes, but it is not itself the architectural unit we should optimize around.

## Extraction Rules

Code belongs in `packages/planes` only if all of the following are true:

1. It is used or expected to be used by multiple products.
2. It does not encode product-local assumptions.
3. It can be tested as a package concern rather than an app concern.
4. It improves clarity by centralizing behavior rather than hiding coupling.

If a module still imports app-local pieces, it is not ready for extraction.

## Auth App vs Auth Plane

The correct model is:

- `Auth app` = OrchestratorAI platform auth product
- `auth plane` = provider abstraction layer used underneath

The `Auth` app owns:

- token issuance and refresh
- entitlements
- org/user/role semantics
- canonical internal auth endpoints
- the platform’s auth contract to other products

The auth plane owns:

- Supabase auth provider behavior
- Azure OIDC / Entra provider behavior
- Google OIDC provider behavior
- claims verification and normalization

## Implication For Product Cleanup

During cleanup and specialization:

- products should consume shared planes where those planes are truly clean
- products should not copy local workarounds into `packages/planes`
- app-local modules that are not yet decoupled should stay local until they are ready

## Success Criteria

- there is a short, defensible list of core planes
- observability is explicitly in the plane set
- auth is modeled as both a product concern and a plane concern without conflating the two
- `supabase-core` is treated as implementation detail, not as a first-class architecture target
- any disputed plane membership is decided explicitly instead of drifting by copy/paste

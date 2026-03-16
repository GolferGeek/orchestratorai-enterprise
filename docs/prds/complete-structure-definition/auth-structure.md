# Auth Structure

## Purpose

Define the target structure for Auth as the platform's identity and access product while preserving the separate auth-plane abstraction underneath it.

## Core Definition

Auth should be treated as a **real product built on top of auth-plane capabilities**, not as a thin wrapper that disappears into a provider adapter.

The key distinction is:

- the auth plane abstracts provider-specific identity infrastructure
- the Auth app owns OrchestratorAI's platform-specific auth behavior

Auth is therefore both:

- a consumer of auth-plane abstractions
- the canonical platform authority for identity and access policy

## Auth Owns

Auth should own:

- login, logout, refresh, and token lifecycle
- JWT issuance and validation policy
- organizations, teams, users, roles, permissions, and entitlements
- platform-specific RBAC and entitlement semantics
- the canonical auth API that every other product depends on
- provider selection and policy application through the auth plane

## Auth Consumes

Auth should consume:

- the auth plane for provider-specific identity implementations
- the relevant database plane for persistence
- shared `transport-types` for shared contracts where useful
- shared observability interfaces where auth events need proper operational visibility

Auth should not be replaced by the auth plane.

## App Versus Plane

The clean model is:

- the auth plane answers "how do we integrate with this identity provider?"
- the Auth app answers "what is OrchestratorAI's identity, entitlement, and token contract?"

That means the Auth app is where the platform decides:

- token contents
- refresh policy
- team and membership semantics
- role semantics
- entitlement rules
- product access decisions

The plane should not own those product decisions.

## What Auth Does Not Own

Auth should not own:

- product-local business logic
- Compose or Forge execution logic
- Bridge routing behavior
- Pulse trigger execution
- Flow productivity logic
- frontend administration UX beyond the APIs that Admin consumes

Auth should also avoid carrying provider-specific sprawl directly in product code when the auth plane can abstract it.

## Runtime Direction

The desired Auth runtime shape is:

1. Auth receives an identity or access request
2. Auth applies OrchestratorAI policy
3. Auth uses auth-plane adapters for the configured provider environment
4. Auth persists and returns the canonical platform result

Every other product should remain a consumer of Auth rather than re-implementing these concerns.

## Plane Direction

Auth should help prove the plane model by consuming:

- auth provider abstractions
- database abstractions
- other relevant shared infrastructure abstractions

But Auth should stay intentionally lean:

- no agent runtime baggage
- no unnecessary workflow abstractions
- no borrowed platform complexity that does not support identity and access

## Rewrite Implications

The Auth cleanup should:

- separate product policy from provider implementation details
- keep Auth as the only writer and source of truth for identity/access state, including canonical team structure
- remove any local infrastructure duplication that belongs in shared planes
- preserve a clear API contract for every other product
- keep Admin as the management UI rather than growing a second auth frontend story inside Auth

## Structural Questions

The Auth structure should answer:

1. Which responsibilities belong in the auth plane versus the Auth app?
2. Which current provider-specific implementations should move behind plane adapters?
3. Which shared planes should Auth consume directly?
4. Which auth events require observability-plane support without overcomplicating the product?

## Success Criteria

- Auth is explicitly modeled as a product, not just an adapter layer
- the auth plane remains a supporting abstraction, not a replacement for Auth
- all other products consume Auth as the canonical source of truth
- Auth is the canonical owner of teams and membership structure
- provider-specific identity implementations are pushed behind plane boundaries where appropriate
- Auth remains lean, security-centered, and professionally bounded

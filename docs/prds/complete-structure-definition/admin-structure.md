# Admin Structure

## Purpose

Define the target structure for Admin as the platform's management UI for auth-backed administration and system configuration visibility.

## Core Definition

Admin should be treated as a **management product**, not as an agent runtime and not as an arbitrary bypass around product boundaries.

Its role is to give operators a clean UI for:

- organizations
- users
- roles and permissions
- entitlements
- selected platform administration views

Admin should not absorb agent execution concerns just because those concerns need an administrative interface.

## Admin Owns

Admin should own:

- management UI for auth-backed entities
- system administration views that belong in a central operator experience
- visualization of shared operational data where that data is exposed by the correct backend
- product administration flows that are administrative in nature, not execution in nature

## Admin Consumes

Admin should consume:

- `Auth` as the canonical backend for identity, orgs, roles, permissions, and entitlements
- the relevant shared planes, especially the database plane, when Admin is intentionally reading or managing platform administrative data directly
- shared `ui` components
- shared `transport-types` where common frontend contracts are useful
- shared observability-backed administrative views where those are intentionally exposed

Admin may read or manage platform data directly when that access is an intentional administrative contract and it goes through the proper shared planes.

What Admin should avoid is ad hoc product-local database access that bypasses shared infrastructure and blurs ownership without a clear administrative reason.

## Backend Direction

Admin should remain **backend-light**.

The preferred model is:

- Admin web calls Auth API for identity and entitlement administration
- Admin reads or manages genuine administrative datasets through shared planes when direct access is the right platform contract
- Admin calls the appropriate product APIs for operational or registry views when those views belong to those products
- Admin does not become a second source of truth for auth, observability, or agent data

## What Admin Does Not Own

Admin should not own:

- JWT issuance or validation logic
- direct database administration through product-local bypasses
- agent execution
- LangGraph workflows
- simple runner execution
- external A2A routing
- internal ambient automation processing

## Planes And Contracts

Admin should consume the relevant shared planes only where Admin actually has those infrastructure concerns.

That means:

- no product-local provider implementations when a shared plane already covers the concern
- no custom or hidden database clients that bypass the shared database plane
- no local observability stack when shared observability interfaces should be consumed instead

The main contract boundary for Admin is still:

- Auth API for admin-of-auth concerns
- shared planes for direct administrative access to platform datasets where that is intentional
- product APIs for product-owned operational concerns

## Product Shape

The clean Admin shape is:

1. authenticated operator enters Admin
2. Admin loads management views through the right backend contract
3. Admin mutates auth-owned state only through Auth
4. Admin renders platform visibility and registry views without becoming the owner of those systems

## Rewrite Implications

The Admin cleanup should:

- keep Admin focused on management responsibilities
- allow direct administrative database access only through shared planes
- avoid duplicating auth logic locally
- avoid becoming a general-purpose platform backend
- consume shared UI and shared infrastructure cleanly where applicable

## Structural Questions

The Admin structure should answer:

1. Which management views are truly Auth-owned versus product-owned?
2. Which operational dashboards belong in Admin as a central UI and which belong in the owning product?
3. Which local infrastructure code in Admin should be removed in favor of shared planes or product APIs?
4. What administrative functionality must remain intentionally thin rather than absorbing backend ownership?

## Success Criteria

- Admin is explicitly modeled as a management UI, not an execution product
- Auth remains the source of truth for identity, orgs, roles, permissions, and entitlements
- Admin can directly access intentional administrative datasets only through proper shared plane contracts
- Admin consumes shared packages where appropriate without growing hidden backend ownership
- Admin remains lean, clear, and professionally bounded

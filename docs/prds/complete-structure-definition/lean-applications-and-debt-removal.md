# Lean Applications And Debt Removal

## Purpose

Define the standard for what “lean and mean” means for the enterprise apps after the structure work is complete.

## Principle

This effort is not only about centralizing code. It is also about removing inherited technical debt from earlier product copies and experiments.

A product is not considered complete just because it builds.

A product is complete when:

- its boundaries are clear
- duplicated infrastructure is gone
- obsolete copied code is gone
- app-local code is intentionally local
- the architecture is legible to both humans and agents

## What Counts As Technical Debt Here

For this work, technical debt includes:

- copied shared infrastructure still living inside products
- duplicated protocol implementations
- product-local workarounds that should be package concerns
- old code that survives only because it was inherited
- stale or misleading architecture docs
- agent guidance that no longer matches the real product shape

## Product Standard

Every product should be clinically precise about:

- what it owns
- what it imports from shared packages
- what it is not allowed to implement locally

The goal is that a developer or agent can enter a product and quickly understand:

1. the product’s job
2. the allowed architecture
3. the forbidden architecture
4. the shared layers it depends on

## Required Cleanup Outcomes

### Shared Concerns

- no unnecessary local plane forks
- no unnecessary local protocol forks
- no hidden provider-specific code spread across products

### Product Concerns

- no product carrying features that belong to another product
- no old copied modules kept “just in case”
- no misleading abstractions preserved only for compatibility with prior internal experiments

### Documentation Concerns

- root docs reflect the actual current architecture
- product-level docs reflect current responsibilities
- agent guidance reflects the real product shape and package boundaries

## Product Review Questions

Every major product should eventually be reviewable against these questions:

1. What is the product’s core responsibility?
2. Which package abstractions does it consume?
3. Which local modules are still justified?
4. Which old copied modules should be removed?
5. Which product-specific debt is blocking a clean architecture?

## Enforcement Direction

This standard should eventually be enforced through:

- product-specific CLAUDE guidance
- specialized product agents
- quality review checklists
- architecture review during major rewrites

## Success Criteria

- each product can be described in a few precise sentences
- each product’s shared-package usage is explicit
- copied legacy structure is not treated as acceptable baseline
- technical debt cleanup is part of the architecture effort, not deferred indefinitely

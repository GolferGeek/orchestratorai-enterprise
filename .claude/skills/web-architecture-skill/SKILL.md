---
name: web-architecture-skill
description: "Classify web files and validate against Vue.js web application patterns. Use when working with Vue components, stores, services, composables, views, or any web application code."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Web Architecture Skill

Classify web files and validate against Vue.js web application patterns, three-layer architecture, and architectural decisions.

## Purpose

This skill enables agents to:
1. **Classify Files**: Identify file types (component, store, service, composable, view, etc.)
2. **Validate Patterns**: Check compliance with web-specific patterns
3. **Check Architecture**: Ensure three-layer architecture is followed
4. **Validate Decisions**: Check compliance with architectural decisions

## When to Use

- **Classifying Files**: When determining what type of file you're working with
- **Validating Patterns**: When checking if code follows web patterns
- **Architecture Compliance**: When ensuring three-layer architecture is maintained
- **Code Review**: When reviewing web code for compliance

## Core Principles

### 1. Three-Layer Architecture

**Store Layer** (`src/stores/`):
- State ONLY (no async, no API calls, no business logic)
- Uses Pinia `defineStore()` with Composition API
- Synchronous mutations only
- Services call mutations after API success

**Service Layer** (`src/services/`):
- All async operations
- All API calls
- All business logic
- Calls store mutations after success

**Component Layer** (`src/components/` or `src/views/`):
- UI presentation only
- Uses stores for state
- Uses services for operations
- Uses composables for reusable logic

### 2. Vue 3 Patterns

- Composition API (`<script setup>`)
- Reactivity (`ref()`, `reactive()`, `computed()`)
- Composables for reusable logic
- Lifecycle hooks (`onMounted()`, `onUnmounted()`)

### 3. ExecutionContext Flow

- ExecutionContext created in `executionContextStore` when conversation selected
- ExecutionContext hydrated from backend when loading existing conversations
- ExecutionContext received from store, never created in components/services
- ExecutionContext passed whole, never cherry-picked

### 4. A2A Protocol

- Use `a2aOrchestrator.execute()` for all A2A calls
- JSON-RPC 2.0 format
- Transport types match mode

## File Classification

### Component Files
- **Location**: `src/components/` or `src/views/`
- **Pattern**: PascalCase (e.g., `LandingPage.vue`, `ChatInput.vue`)
- **Structure**: `<template>`, `<script setup>`, `<style>`
- **Responsibilities**: UI presentation, uses stores/services

### Store Files
- **Location**: `src/stores/`
- **Pattern**: camelCase with `Store` suffix (e.g., `conversationsStore.ts`)
- **Structure**: `defineStore()` with Composition API
- **Responsibilities**: State management only (no async, no API calls)

### Service Files
- **Location**: `src/services/`
- **Pattern**: camelCase with `Service` suffix (e.g., `apiService.ts`)
- **Structure**: Class or object with async methods
- **Responsibilities**: All async operations, API calls, business logic

### Composable Files
- **Location**: `src/composables/`
- **Pattern**: camelCase with `use` prefix (e.g., `useValidation.ts`)
- **Structure**: Function returning reactive state and functions
- **Responsibilities**: Reusable logic extracted from components

### View Files
- **Location**: `src/views/`
- **Pattern**: PascalCase (e.g., `DashboardPage.vue`)
- **Structure**: Full page component
- **Responsibilities**: Page-level UI, may use multiple components

## Validation Checklist

When validating web code:

- [ ] File is in correct location (stores/, services/, components/, etc.)
- [ ] File follows naming convention
- [ ] Three-layer architecture is maintained
- [ ] ExecutionContext flows correctly (if applicable)
- [ ] A2A calls use `a2aOrchestrator.execute()` (if applicable)
- [ ] Vue 3 patterns followed (composition API, reactivity)
- [ ] No business logic in stores
- [ ] No state management in services
- [ ] No API calls in components (use services)

## Related

- **`execution-context-skill/`**: ExecutionContext flow validation
- **`transport-types-skill/`**: A2A protocol compliance
- **`web-testing-skill/`**: Web testing patterns

## Notes

- Classification happens **before** writing code
- Validation happens **during and after** writing code
- Architecture compliance is **non-negotiable**

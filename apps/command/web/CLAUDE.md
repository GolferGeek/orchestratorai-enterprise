# Command (Navigation Shell)

## Why This Product Exists

Command exists because **navigation and product launching is a distinct concern from business logic**. Users need a single entry point that shows them what they can access based on their entitlements, and routes them to the right product. Command never contains business logic — it is pure navigation shell.

## Core Architectural Philosophy

### Shell Only, Zero Business Logic

Command does exactly three things:
1. Authenticates the user via Auth API
2. Reads their entitlements (which products they can access)
3. Renders navigation and routes to those products

It never calls the database directly. It never processes anything. It never renders agent dashboards. It is a launcher.

### Entitlements Drive Everything

The navigation menu is dynamically generated from the user's entitlements:

```typescript
// Command reads entitlements, shows only what the user can access
const entitlements = await authApi.getEntitlements(context);
// If user has 'forge' entitlement → show Forge menu item
// If user has 'compose' entitlement → show Compose menu item
// etc.
```

If a product is not in the user's entitlements, it is not shown. Period.

## Port Assignments

- Web: 6102 (dev) / 7000 (prod)
- No API — Command calls Auth API (port 6100) directly

## Architecture

```
apps/command/web/src/
  router/                           ← Top-level routing
  stores/
    entitlements.store.ts           ← Reads entitlements from Auth API
  components/
    navigation/                     ← Nav shell (header, sidebar, menu)
    product-launcher/               ← Product links/tiles
```

## What Does NOT Belong Here

- **Any business logic** — no agent dashboards, no conversations, no processing
- **Database calls** — Command never talks to the database
- **Agent code** of any kind — Forge, Compose, or Pulse
- **Admin views** — Admin Web

## Dependencies

- `@orchestratorai/transport-types` — shared types
- `@orchestratorai/ui` — shared UI component library
- Auth API (port 6100) — login, token refresh, entitlements

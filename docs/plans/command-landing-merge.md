# PRD: Merge Landing into Command — Unified Entry Point

## Problem

Today there are two separate apps for the entry experience:
- **Landing Web** (port 6400) — public marketing site (hero, features, pricing, What's Possible)
- **Command Web** (port 6102) — authenticated shell with product launcher

This creates a disjointed flow: visitors land on 6400, click "Log In", get redirected to 6102, see a plain login form, then see product cards. Two separate codebases, two ports, two mental models. The marketing content and the authenticated experience feel like different products.

## Vision

**One app. One URL. Two states.**

- **Unauthenticated** → Full landing page experience: hero section, features, pricing, What's Possible, customer service chat widget. Login/Get Started buttons. No sidebar, no product navigation.
- **Authenticated** → OrchestratorAI shell: "OrchestratorAI" brand top-left, sidebar with product links (Forge, Compose, Flow, Admin, Pulse, Bridge), main content area with product dashboard. ClaudeCodePane, theme toggle, user menu.

The brand "OrchestratorAI" replaces "Command" everywhere. Command as a product name disappears — it's just the OrchestratorAI home experience.

## Architecture

### Current State

```
apps/landing/web/         ← Port 6400, public Vue app
  src/views/
    LandingPage.vue       ← Hero, CTAs
    FeaturesPage.vue      ← Product details
    PricingPage.vue       ← Partnership tiers
    WhatsPossiblePage.vue ← Industry agent ideas
    AboutPage.vue         ← Company info
  src/components/landing/
    NavBar.vue            ← Public nav (Home, Features, Pricing, About, What's Possible, Log In, Get Started)
    Footer.vue            ← Public footer
    HeroSection.vue       ← Hero content
    ...

apps/command/web/         ← Port 6102, authenticated Vue app
  src/views/
    AppShellPage.vue      ← OaiAppShell with sidebar + product nav
    DashboardPage.vue     ← Product launcher cards
    LoginPage.vue         ← Email/password login form
```

### Target State

```
apps/command/web/         ← Port 6102, unified app (rename to apps/home/web later)
  src/views/
    public/               ← Unauthenticated routes (moved from Landing)
      LandingPage.vue
      FeaturesPage.vue
      PricingPage.vue
      WhatsPossiblePage.vue
      AboutPage.vue
    app/                  ← Authenticated routes (existing Command)
      AppShellPage.vue    ← OaiAppShell branded "OrchestratorAI"
      DashboardPage.vue   ← Product launcher
  src/components/
    landing/              ← Moved from Landing web
      NavBar.vue          ← Public nav (updated: Log In navigates to /login, not external URL)
      Footer.vue
      HeroSection.vue
      ...
  src/router/index.ts     ← Unified router with public + auth guards
```

### Router Design

```typescript
const routes = [
  // Public routes — no auth required, no sidebar
  {
    path: '/',
    component: PublicLayout,  // NavBar + Footer, no sidebar
    children: [
      { path: '', component: LandingPage },
      { path: 'features', component: FeaturesPage },
      { path: 'pricing', component: PricingPage },
      { path: 'whats-possible', component: WhatsPossiblePage },
      { path: 'about', component: AboutPage },
      { path: 'login', component: LoginPage },
    ],
  },
  // Authenticated routes — sidebar + OaiAppShell
  {
    path: '/app',
    component: AppShellPage,  // OaiAppShell with sidebar
    meta: { requiresAuth: true },
    children: [
      { path: 'dashboard', component: DashboardPage },
      // ... other authenticated routes
    ],
  },
];
```

### Key Behaviors

1. **`/` (root)** — Landing page. If already authenticated, still show landing (don't auto-redirect). Users choose when to enter the app.
2. **`/login`** — Login form. On success, redirect to `/app/dashboard`.
3. **`/app/*`** — Auth guard. If not authenticated, redirect to `/login?redirect=/app/dashboard`.
4. **Navigation**: "Log In" and "Get Started" buttons navigate to `/login` (same app, client-side route). No more cross-port redirects.
5. **Product links in sidebar**: Still external URLs with SSO tokens (Forge on 6201, Flow on 6901, etc.). These are separate apps.

## Steps

### Phase 1: Move Landing content into Command

1. Copy `apps/landing/web/src/views/*.vue` → `apps/command/web/src/views/public/`
2. Copy `apps/landing/web/src/components/landing/` → `apps/command/web/src/components/landing/`
3. Update all imports in the moved files (relative paths change)
4. Update NavBar.vue: "Log In" and "Get Started" become `<router-link to="/login">` instead of external URLs
5. Create `PublicLayout.vue` — wrapper with NavBar + Footer + `<router-view />`

### Phase 2: Unify the router

1. Update Command's `router/index.ts` with the two-tier structure (public + authenticated)
2. Public routes: `/`, `/features`, `/pricing`, `/whats-possible`, `/about`, `/login`
3. Authenticated routes: `/app/dashboard` (existing)
4. Auth guard only on `/app/*` routes
5. Login page: on success redirect to `/app/dashboard` or `?redirect=` param

### Phase 3: Rebrand

1. Change all "Command" references to "OrchestratorAI"
2. `productName` prop: "OrchestratorAI" (already done)
3. Bottom-left product indicator: "OrchestratorAI" instead of "Command"
4. Page title: "OrchestratorAI" instead of "Orchestrator AI"
5. Remove the separate `product-slug="command"` or rename to `home`

### Phase 4: Retire Landing Web

1. Remove `apps/landing/web/` from the repo (or mark as deprecated)
2. Remove `dev:landing` from `package.json` and `dev-servers.sh`
3. If external URLs pointed to port 6400, redirect to port 6102

### Phase 5: Polish

1. Verify unauthenticated flow: Landing → Features → Pricing → Login → Dashboard
2. Verify authenticated flow: Dashboard → Products → Back to Dashboard
3. Theme toggle works across both public and authenticated views
4. Customer service chat widget works on public pages
5. Mobile responsive on public pages

## What Does NOT Change

- Product apps (Forge, Compose, Flow, Pulse, Bridge, Admin) remain separate
- SSO token passing to products remains the same
- Auth API integration unchanged
- OaiAppShell, sidebar, product launcher — all stay the same for authenticated users

## Port Assignment

- Command stays on 6102 (dev) / 7000 (prod)
- Port 6400 (Landing) freed up — no longer needed

## Risk

- **Low**: Landing components are self-contained Vue views. Moving them is mechanical.
- **Medium**: Router unification needs careful auth guard testing. The two-tier layout (public NavBar vs authenticated OaiAppShell) needs clean separation.
- **Consider**: Some Landing components may import from Landing-specific packages or use Landing-specific env vars. These need to be reconciled.

---
name: Standard Components Before Testing
description: User wants shared UI components built FIRST, then wire all products, then browser test. Fixes propagate from one place instead of 7+ individual changes.
type: feedback
---

Build standard shared components in packages/ui/ BEFORE browser testing, not after.

**Why:** If each product has its own bespoke components, every fix during testing requires 7+ changes across products. With shared components, one fix propagates everywhere. Build the foundation first, then test on top of it.

**How to apply:**
1. Build packages/ui/ standard component library (AppShell, TopNavBar, SidebarNav, ThemeProvider, CrawlerBubble, standard cards/tables/buttons/forms)
2. Include dark + light theme support with CSS variables
3. Include crawler conversation bubble in top nav bar of every product
4. Wire ALL product web apps to use shared components from @orchestratorai/ui
5. THEN do browser testing
6. Any issues found during testing get fixed once in packages/ui/

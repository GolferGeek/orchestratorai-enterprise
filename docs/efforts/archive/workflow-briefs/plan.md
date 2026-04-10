# Workflow Briefs — Implementation Plan

**PRD**: ./prd.md
**Created**: 2026-04-10
**Status**: In Progress

## Progress Tracker

- [x] Phase 1: Markdown Rendering & Sanitization
- [x] Phase 2: Video Embeds
- [x] Phase 3: Edit Flow & Styling
- [x] Phase 4: Landing Panel

---

## Phase 1: Markdown Rendering & Sanitization
**Status**: Complete
**Objective**: Replace the regex-based markdown renderer in BriefModal with `marked` + `DOMPurify` so all standard markdown elements render correctly.

### Steps
- [x] 1.1 Verify `marked` and `dompurify` are installed in `apps/forge/web/` (they are — `marked@^15.0.11`, `dompurify@^3.2.6`)
- [x] 1.2 In `BriefModal.vue`, import `marked` and `DOMPurify`, replace the `renderMarkdown()` function with `DOMPurify.sanitize(marked.parse(md))` 
- [x] 1.3 Remove the old regex-based `renderMarkdown` function entirely
- [x] 1.4 Add CSS styles for rendered markdown content inside `.brief-content`: heading sizes, list indentation (`ul`, `ol`), code blocks, blockquotes, links, paragraphs
- [x] 1.5 Verify in the edit-mode preview path that the same renderer is used (the `v-html="renderMarkdown(editMarkdown)"` on line 81 will pick up the new function automatically)

### Quality Gate

- [ ] **Lint**: `cd apps/forge/web && npx eslint src/views/agents/legal-department/components/BriefModal.vue`
- [ ] **Build**: `cd apps/forge/web && npx vite build`
- [ ] **Unit Tests**: `cd apps/forge/web && npx vitest run`
- [ ] **Chrome Tests**:
  - [ ] Open Document Onboarding page, click "Benefits" — modal opens with properly rendered markdown (headings, bold, italic, lists, links all correct)
  - [ ] Verify no raw HTML tags or broken formatting
  - [ ] Verify XSS protection: markdown with `<script>alert('xss')</script>` does not execute
- [ ] **Phase Review**:
  - [ ] Regex renderer fully removed, no remnants
  - [ ] `marked` + `DOMPurify` used for all markdown rendering in the component
  - [ ] Standard markdown elements render correctly

---

## Phase 2: Video Embeds
**Status**: Complete
**Objective**: Detect YouTube and Loom URLs and render them as embedded iframes instead of external links.

### Steps
- [x] 2.1 Create a `parseVideoEmbed(url: string)` utility function in `BriefModal.vue` that:
  - Detects YouTube URLs (`youtube.com/watch?v=ID`, `youtu.be/ID`) → returns `https://www.youtube.com/embed/ID`
  - Detects Loom URLs (`loom.com/share/ID`) → returns `https://www.loom.com/embed/ID`
  - Returns `null` for unrecognized URLs
- [x] 2.2 In read mode (line 86-100): replace the `<a>` link with a responsive iframe when `parseVideoEmbed(video)` returns a URL, keep the link as fallback for unrecognized URLs
- [x] 2.3 In edit-mode preview (line 68-82): apply the same embed logic using `editVideo`
- [x] 2.4 Add CSS for responsive iframe: 16:9 aspect ratio container, max-width, iframe fills container, `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"`, `title` attribute for accessibility
- [x] 2.5 Add a test video URL to one of the brief.md files to verify (e.g., a Loom URL in `document-onboarding/brief.md` frontmatter)

### Quality Gate

- [ ] **Lint**: `cd apps/forge/web && npx eslint src/views/agents/legal-department/components/BriefModal.vue`
- [ ] **Build**: `cd apps/forge/web && npx vite build`
- [ ] **Unit Tests**: `cd apps/forge/web && npx vitest run`
- [ ] **Chrome Tests**:
  - [ ] Open BriefModal for a workflow with a Loom video URL — see an embedded Loom player (not a link)
  - [ ] Change the video URL to a YouTube URL — see an embedded YouTube player
  - [ ] Use an unrecognized URL (e.g., vimeo) — see the original "Watch Video" external link
  - [ ] In edit mode, enter a Loom URL, switch to Preview tab — see the embed
- [ ] **Phase Review**:
  - [ ] YouTube and Loom URL detection works for common URL formats
  - [ ] Fallback to link for unrecognized URLs preserved
  - [ ] Iframe has sandbox attributes and title for security/accessibility

---

## Phase 3: Edit Flow & Styling
**Status**: Complete
**Objective**: Verify and fix the full edit cycle, add save loading state and error toasts, align modal styling with Legal Department UI.

### Steps
- [x] 3.1 Test GET → edit flow: open modal, click Edit, verify title/video/markdown fields are populated from the fetched brief
- [x] 3.2 Test save flow: modify fields, click Save, verify PUT request sends correct payload and brief.md file on disk is updated
- [x] 3.3 Test re-fetch: close modal, reopen — verify saved changes appear
- [x] 3.4 Test cancel: edit fields, click Cancel, reopen edit — verify original values restored (not the unsaved edits)
- [x] 3.5 Add loading state to Save button: show `ion-spinner` during the PUT request, disable the button to prevent double-submit
- [x] 3.6 Add toast notifications: success toast on save, error toast on failure (using `toastController` from Ionic)
- [x] 3.7 Style the modal to match Legal Department UI: consistent typography, spacing, color palette with the workflow pages
- [x] 3.8 Style rendered markdown content: proper heading hierarchy (h1 > h2 > h3 sizing), list padding, link colors, code block background
- [x] 3.9 Style the video embed to fit naturally (margin, max-width within `.brief-content`)
- [x] 3.10 Style edit mode form inputs to match page patterns (consistent label styling, input borders)
- [x] 3.11 Fix any bugs discovered during testing

### Quality Gate

- [ ] **Lint**: `cd apps/forge/web && npx eslint src/views/agents/legal-department/components/BriefModal.vue`
- [ ] **Build**: `cd apps/forge/web && npx vite build`
- [ ] **Unit Tests**: `cd apps/forge/web && npx vitest run`
- [ ] **Curl Tests**:
  - [ ] `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:6200/agents/legal-department/brief/document-onboarding` → returns `{ title, video, markdown }`
  - [ ] `curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Test","video":"","markdown":"# Test"}' http://localhost:6200/agents/legal-department/brief/document-onboarding` → returns `{ success: true }`
  - [ ] Re-GET to verify the PUT persisted
- [ ] **Chrome Tests**:
  - [ ] Full edit cycle: open → edit → change title & markdown → preview → save → close → reopen → changes persisted
  - [ ] Cancel discards changes
  - [ ] Save button shows spinner during save
  - [ ] Error toast appears if save fails (test by stopping API)
  - [ ] Non-admin user sees no Edit button
  - [ ] Modal styling is consistent with the Legal Department pages
- [ ] **Phase Review**:
  - [ ] Edit/save/cancel cycle works end-to-end
  - [ ] Loading and error states are handled
  - [ ] Modal styling is consistent with surrounding UI
  - [ ] No regressions in read mode

---

## Phase 4: Landing Panel
**Status**: Complete
**Objective**: Replace the empty "No jobs yet" state with a brief-powered landing panel that includes a workflow CTA.

### Steps
- [x] 4.1 Create `BriefLandingPanel.vue` in `apps/forge/web/src/views/agents/legal-department/components/`:
  - Props: `agentSlug`, `capabilitySlug`, `ctaLabel` (e.g., "Upload Your First Contract"), `ctaAction` (emit)
  - On mount: fetch brief via GET `/agents/:slug/brief/:capabilitySlug`
  - Render: brief title, video embed (reuse `parseVideoEmbed` — extract to a shared util or import), rendered markdown (using `marked` + `DOMPurify`), prominent CTA button
  - Emit `cta` event when button is clicked
- [x] 4.2 Extract `parseVideoEmbed` and `renderMarkdown` into a shared utility file `apps/forge/web/src/views/agents/legal-department/utils/briefUtils.ts` so both `BriefModal.vue` and `BriefLandingPanel.vue` can use them
- [x] 4.3 Update `BriefModal.vue` to import from `briefUtils.ts` instead of defining locally
- [x] 4.4 In `JobActivityList.vue`: add a named slot `empty` so parent pages can override the empty state (lines 29-33)
- [x] 4.5 In `DocumentOnboardingPage.vue`: when job list is empty, show `BriefLandingPanel` via the `empty` slot with `cta-label="Upload Your First Contract"` and `@cta="uploadModalOpen = true"`
- [x] 4.6 In `ContractReviewPage.vue`: same pattern with `cta-label="Review Your First Contract"` and the appropriate CTA action
- [x] 4.7 Style the landing panel: centered layout, prominent CTA button (primary color, large), brief content above the CTA, video embed if present

### Quality Gate

- [ ] **Lint**: `cd apps/forge/web && npx eslint src/views/agents/legal-department/`
- [ ] **Build**: `cd apps/forge/web && npx vite build`
- [ ] **Unit Tests**: `cd apps/forge/web && npx vitest run`
- [ ] **Chrome Tests**:
  - [ ] New user (no jobs): Document Onboarding page shows brief content with "Upload Your First Contract" CTA
  - [ ] Click CTA → upload modal opens (same as "New" button)
  - [ ] New user (no jobs): Contract Review page shows brief content with "Review Your First Contract" CTA
  - [ ] User with existing jobs: sees normal job list, no landing panel
  - [ ] "Benefits" button in toolbar still works regardless of job count
  - [ ] Landing panel shows video embed if brief has a video URL
- [ ] **Phase Review**:
  - [ ] Empty state replaced with brief landing panel on both pages
  - [ ] CTA triggers the same action as the "New" button
  - [ ] Shared utilities extracted, no code duplication between BriefModal and BriefLandingPanel
  - [ ] All PRD requirements from section 4.5 are met
  - [ ] No regressions in existing functionality (job list, modals, toolbar buttons)

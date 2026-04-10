# Workflow Briefs — Product Requirements Document

## 1. Overview

Workflow briefs are structured markdown documents that explain a workflow's value to lawyers — benefits first, features second. The core infrastructure (brief.md files, API endpoints, BriefModal, Benefits button) is already built. This effort completes the feature by polishing the modal (proper markdown rendering, video embeds, verified edit flow, UI styling), adding a brief-powered landing panel for empty workflow states, and establishing the pattern for future workflows.

## 2. Goals & Success Criteria

| Goal | Success Criterion |
|------|-------------------|
| Markdown renders correctly | All standard markdown elements (headings, bold, italic, lists, links, code) render properly using a real markdown library |
| Video embeds work | Loom and YouTube URLs render as embedded players, not just links |
| Edit flow is verified | Admin can edit title, video URL, and markdown, save, and see changes reflected immediately |
| Modal matches Legal Department UI | Modal styling is consistent with the existing Legal Department page design |
| Landing panel replaces empty state | New users see the brief with a CTA ("Upload Your First Contract") instead of "No jobs yet" |
| Pattern is documented | Future workflow authors know to create brief.md before writing code |

## 3. User Stories

**Lawyer (regular user):**
- I open the Document Onboarding page for the first time. Instead of "No jobs yet", I see a clear explanation of what this workflow does for me and a button to get started.
- I click "Benefits" and see a polished modal with well-rendered content and an embedded video walkthrough.

**Admin (power user):**
- I click "Benefits", then "Edit" inside the modal. I edit the brief's title, video URL, and markdown content. I toggle to Preview to check my work, then save. The changes persist.

**Developer (future workflow author):**
- When building a new legal workflow, I create `brief.md` alongside the workflow code, writing benefits before I write any code.

## 4. Technical Requirements

### 4.1 Markdown Rendering

**Current state:** `BriefModal.vue` uses a hand-rolled regex-based `renderMarkdown()` function that handles only headings, bold, unordered lists (with a wrapping bug), and paragraph breaks. No support for italic, links, code, ordered lists, or other standard markdown.

**Change:** Replace the regex renderer with a proper markdown library.

- Install `marked` (lightweight, well-maintained, already commonly used in Vue projects)
- Replace the `renderMarkdown()` function with a call to `marked.parse()`
- Sanitize output with `DOMPurify` to prevent XSS via `v-html`
- Remove the old regex-based function entirely

**Files:**
- `apps/forge/web/src/views/agents/legal-department/components/BriefModal.vue` — replace renderer

### 4.2 Video Embed Support

**Current state:** Video URL renders as an external "Watch Video" link button. No embedding.

**Change:** Detect Loom and YouTube URLs and render them as embedded iframes.

- Parse the video URL to detect provider:
  - YouTube: `youtube.com/watch?v=ID` or `youtu.be/ID` → embed URL `https://www.youtube.com/embed/ID`
  - Loom: `loom.com/share/ID` → embed URL `https://www.loom.com/embed/ID`
- Render a responsive iframe (16:9 aspect ratio) when a recognized URL is present
- Fall back to the existing external link button for unrecognized URLs
- In edit mode preview, show the embed so admins can verify their URL works

**Files:**
- `apps/forge/web/src/views/agents/legal-department/components/BriefModal.vue` — add embed logic

### 4.3 Edit Flow Verification & Fixes

**Current state:** Edit mode exists with title/video/markdown inputs and save/cancel buttons. The save calls `PUT /agents/:slug/brief/:capabilitySlug`. Not verified end-to-end.

**Change:** Test and fix the full edit cycle in the browser:

- Verify GET populates edit fields correctly
- Verify PUT saves and the API reconstructs frontmatter properly
- Verify the modal re-fetches on next open (no stale cache)
- Verify cancel discards unsaved changes
- Verify the Save button shows loading state and handles errors (toast on failure)
- Fix any bugs found during testing

**Files:**
- `apps/forge/web/src/views/agents/legal-department/components/BriefModal.vue` — fix issues found
- `apps/forge/api/src/agent-registry/agent-registry.controller.ts` — fix issues found

### 4.4 Modal Styling

**Current state:** BriefModal exists but styling may not match the Legal Department UI patterns.

**Change:** Align the modal with existing Legal Department styling:

- Use the same color palette, typography, and spacing as the workflow pages
- Ensure the rendered markdown content has proper styling (heading sizes, list indentation, code blocks)
- Style the video embed to fit naturally within the modal content
- Ensure edit mode inputs and buttons match the page's form styling
- Responsive: modal should work on smaller screens (the 90% width/height is already set)

**Files:**
- `apps/forge/web/src/views/agents/legal-department/components/BriefModal.vue` — CSS updates

### 4.5 Landing Panel

**Current state:** When a workflow page has no jobs, `JobActivityList.vue` shows a `documentOutline` icon, "No jobs yet.", and a hint like "Click 'New' to upload a document." This is generic and doesn't communicate value.

**Change:** When the job list is empty, show the workflow brief as the landing experience:

- Add a new `BriefLandingPanel.vue` component that:
  - Fetches the brief via the existing GET endpoint
  - Renders the brief content (using the same markdown renderer)
  - Shows the video embed if a video URL is present
  - Includes a prominent CTA button (e.g., "Upload Your First Contract" / "Review Your First Contract")
  - The CTA triggers the same action as the "New" button on the page
- In `DocumentOnboardingPage.vue` and `ContractReviewPage.vue`, when the job list is empty, show `BriefLandingPanel` instead of the default empty state
- The "Benefits" button in the toolbar remains available regardless of job count

**Files:**
- `apps/forge/web/src/views/agents/legal-department/components/BriefLandingPanel.vue` — new component
- `apps/forge/web/src/views/agents/legal-department/DocumentOnboardingPage.vue` — wire in landing panel
- `apps/forge/web/src/views/agents/legal-department/ContractReviewPage.vue` — wire in landing panel

### 4.6 Future Workflow Pattern

**No code changes required.** This is a process requirement:

- Every new legal workflow MUST include a `brief.md` file alongside the workflow code
- The brief should be written BEFORE the workflow code — it clarifies what we're building
- The `BRIEF_PATHS` registry in `agent-registry.controller.ts` must be updated when new workflows are added
- Brief follows the established frontmatter format: `title`, `video` (optional), then markdown with Benefits before Features

## 5. Non-Functional Requirements

- **Performance:** Markdown parsing and video URL detection must be client-side and instant. No additional API calls beyond the existing GET.
- **Security:** Markdown output MUST be sanitized with DOMPurify before injection via `v-html`. Video embeds use sandboxed iframes.
- **Bundle size:** `marked` is ~40KB minified. `DOMPurify` is ~15KB. Acceptable for the functionality gained.
- **Accessibility:** Video embeds should include a title attribute. Markdown content should use semantic HTML.

## 6. Out of Scope

- **Brief versioning or history** — latest save wins, as stated in constraints
- **Brief for non-legal workflows** — pattern is established but implementation is only for legal-department workflows
- **Custom markdown extensions** — standard markdown only, no custom DSL
- **Auto-generating briefs from workflow code** — briefs are human-authored
- **Offline support** — briefs require API access
- **Changes to the BRIEF_PATHS registry pattern** — the current hardcoded registry works for now

## 7. Dependencies & Risks

| Dependency | Status | Risk |
|------------|--------|------|
| brief.md files for document-onboarding and contract-review | Done | None |
| GET/PUT API endpoints | Done | Low — may find bugs during edit flow testing |
| BriefModal.vue component | Done | Low — being modified, not rewritten |
| RBAC / isAdmin detection | Done | None |
| `marked` npm package | Not installed | None — standard, well-maintained library |
| `DOMPurify` npm package | Not installed | None — standard security library |

**Risks:**
- The `BRIEF_PATHS` registry in the controller is hardcoded. Adding workflows requires a code change. This is acceptable for the current scope but should be revisited if the number of workflows grows significantly.
- The PUT endpoint writes directly to the filesystem. In containerized deployments, these changes would be lost on restart. This is a known limitation documented in the intention (no versioning).

## 8. Phasing

### Phase 1: Markdown Rendering & Sanitization
- Install `marked` and `DOMPurify`
- Replace regex renderer in BriefModal with `marked.parse()` + DOMPurify
- Add CSS for rendered markdown (headings, lists, code blocks, links)
- **Gate:** Open BriefModal, verify all markdown elements render correctly

### Phase 2: Video Embeds
- Add URL parser for YouTube and Loom embed URLs
- Replace the "Watch Video" link with a responsive iframe embed
- Fall back to link for unrecognized URLs
- Populate a test video URL in one of the brief.md files
- **Gate:** Verify Loom and YouTube URLs render as embedded players in both view and edit-preview modes

### Phase 3: Edit Flow & Styling
- Test the full edit cycle (open → edit → preview → save → reopen)
- Fix any bugs found (field population, save/reload, cancel behavior, error handling)
- Align modal styling with Legal Department UI (colors, typography, spacing)
- **Gate:** Admin can edit and save a brief; non-admin sees no edit controls; modal looks consistent with the rest of the UI

### Phase 4: Landing Panel
- Create `BriefLandingPanel.vue` component
- Wire into DocumentOnboardingPage and ContractReviewPage as empty-state replacement
- CTA button triggers the same action as the page's "New" button
- **Gate:** New user with no jobs sees the brief landing panel with CTA; clicking CTA starts the workflow; users with existing jobs see the normal job list

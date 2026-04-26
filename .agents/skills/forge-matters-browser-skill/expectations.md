# Persistent Case Team (Matters) — Pass/Fail Expectations

## Flow 1: Matter List Page Load
**PASS**: `/app/agents/legal-department/matters` loads, matter list visible (or empty state if no matters), "Create Matter" button visible.
**FAIL**: Blank screen → P0. Redirect to login → P0.

## Flow 2: Create a Matter
**PASS**: `CreateMatterModal` opens, all fields accessible, "Create Matter" submits. New matter appears in list immediately (or after poll refresh).
**FAIL**: Modal doesn't open → P1. Form fields missing → P1. Matter doesn't appear after create → P1.

## Flow 3: Matter Dashboard Opens
**PASS**: Clicking a matter in the list opens `MatterDashboard` at `/matters/:matterId`. Stats bar visible. Case Overview and Documents tabs present.
**FAIL**: Clicking matter doesn't navigate → P1. Dashboard blank → P1. Tabs missing → P1.

## Flow 4: Document Upload to Matter
**PASS**: From Documents tab, uploading files triggers job creation. Both Facts Agent and Documents Agent jobs appear in the matter's job list. Both transition to `processing` → `completed`.
**FAIL**: Upload button missing → P1. Only one agent runs (not both) → P1. Jobs stay `queued` >30s → P0.

## Flow 5: Entity Deduplication Visible
**PASS**: After document processing, Case Overview tab shows extracted entities. Same person referenced in multiple documents appears as one entity (not duplicated). Timeline events appear with dates.
**FAIL**: Case Overview blank after processing → P1. Same person appears twice → P2 (deduplication broken).

## Flow 6: Sub-Workflow Access
**PASS**: From Documents tab, an action to launch Deposition Prep is accessible (button or link). Clicking it opens `PrepDepositionModal`.
**FAIL**: No path to Deposition Prep visible → P1. Modal doesn't open → P1.

## Flow 7: Stats Bar Updates
**PASS**: After document upload and processing, stats bar updates: document count increases, entity count increases, timeline event count increases.
**FAIL**: Stats bar stays 0 after processing → P1.

## Regression Checklist
- [ ] Matter list loads
- [ ] Create matter works
- [ ] Document upload triggers both agents
- [ ] Case Overview shows entities + timeline
- [ ] Deposition Prep accessible from Documents tab

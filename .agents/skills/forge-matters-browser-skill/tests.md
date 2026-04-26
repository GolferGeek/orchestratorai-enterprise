# Persistent Case Team (Matters) — Test Cases

## Test MT-1: Matter List Page Load
Navigate to `/app/agents/legal-department/matters`. Verify: page loads, matter list or empty state visible, "Create Matter" button accessible.

## Test MT-2: Create a Matter
Click "Create Matter". Fill in: name, client, type (litigation), jurisdiction. Click submit. Verify: modal closes, new matter appears in list.

## Test MT-3: Open Matter Dashboard
Click the new matter. Verify: navigates to `/matters/:matterId`. `MatterDashboard` loads. Stats bar shows (even if all zeros). Case Overview and Documents tabs visible.

## Test MT-4: Upload Documents to Matter
From Documents tab, upload 2–3 test documents. Verify: upload triggers both Facts Agent and Documents Agent jobs. Both jobs appear in matter's job list. Both progress to `processing` → `completed`.

## Test MT-5: Entities and Timeline in Case Overview
After both agents complete, click Case Overview tab. Verify: entities extracted (persons, organizations). Timeline events listed with dates. Stats bar shows updated counts (documents > 0, entities > 0).

## Test MT-6: Entity Deduplication
Upload a second set of documents that reference the same person mentioned in the first set. After processing, verify: that person appears as ONE entity in Case Overview, not duplicated.

## Test MT-7: Sub-Workflow Access
From Documents tab, look for "Prepare for Deposition" or similar action. Verify: clicking it opens `PrepDepositionModal` (see `forge-deposition-prep-browser-skill` for full deposition test).

## Test MT-8: Multiple Matters
Create a second matter. Verify: both matters appear in list. Navigating between them shows each their own data (not shared).

## Regression Checklist
- [ ] MT-1: Matter list loads
- [ ] MT-2: Create matter works
- [ ] MT-4: Document upload triggers both agents
- [ ] MT-5: Case Overview shows entities + timeline after processing

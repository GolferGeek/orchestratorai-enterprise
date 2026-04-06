---
description: Turn an intention file into a PRD — goals, non-goals, success criteria, test expectations.
---

# /prd

**Input:** Path to the intention file (e.g. `docs/artifacts/intention.md`).
**Output:** A PRD file at the path the user specifies (default: `docs/artifacts/prd.md`).

When the user runs this command:

1. **Read the intention file** from the path provided. If no path is given, ask for it — don't guess.

2. **Draft a PRD** with these sections:
   - **Summary** — one paragraph restating the intention.
   - **Goals** — each Demo-grade minimum from the intention becomes a numbered goal with **testable acceptance criteria**. Be specific: "User can create an invoice with client name, line items, and due date" not "invoicing works."
   - **Non-goals** — pulled from the intention's "Out of scope" section, plus anything you think should be explicitly excluded.
   - **Success criteria** — how we'll know the build is done (builds clean, tests pass, specific user flows work).
   - **Test expectations** — what the Playwright tests (web) or XCTest/XCUITest (iOS) should cover. Name the flows.
   - **Open questions** — anything ambiguous in the intention that should be resolved before planning.

3. **Cross-check against the intention**: every goal must trace to the intention. If a goal doesn't have a matching intention item, flag it. If an intention item doesn't have a matching goal, flag it.

4. **Challenge the user**: "What's missing or wrong if we ship this PRD as-is?" Wait for their input before finalizing.

5. **Write the PRD** to `docs/artifacts/prd.md` (or path they specify). Tell the user the exact path so they can pass it to `/plan`.

## Example usage

```
/prd docs/artifacts/intention.md
/prd docs/phase-01/intention-quickbooks-killer.md
```

Arguments: `$ARGUMENTS` — path to the intention file.

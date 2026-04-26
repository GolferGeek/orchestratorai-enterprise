# Compliance Audit — Completeness Audit Reference

## Brief Status
**File**: `apps/forge/api/src/agents/legal-department/workflows/compliance-audit/brief.md`
**Quality**: Good — solid but missing some differentiators
**video: field**: ✗ MISSING

## Feature Inventory

| Feature | In Code | In Brief |
|---------|---------|----------|
| Two audit modes (Compliance Scan vs Full Audit) | ✓ | ~ not clearly differentiated |
| Multi-framework simultaneous audit | ✓ | ✓ |
| Per-finding status (5 levels) | ✓ | ✓ |
| Override individual finding statuses | ✓ | ✗ |
| Quantified scorecard (per-theme, per-framework, overall) | ✓ | ✓ |
| RAG integration (framework-specific collections) | ✓ | ✓ |
| Remediation plan with priorities | ✓ | ✓ |
| Specific pre-loaded frameworks list | ✓ | ✗ |
| StageLadder | ✓ | ✗ |
| Sovereign/local mode | ✓ | ✗ |

## Known Gaps

**Gap 1: video: field empty (P2)**

**Gap 2: Two audit modes not differentiated in benefits (P2)** — The brief lists both modes but doesn't explain when to use each or what the difference means for the output.

**Gap 3: Per-finding override not highlighted (P2)** — The ability to change individual finding statuses (not just approve/reject the whole audit) is powerful. Auditors need this for findings where the AI's assessment is wrong.

**Gap 4: Pre-loaded frameworks not listed (P3)** — Which specific frameworks are available? GDPR, HIPAA, SOX, CCPA, ISO 27001, PCI-DSS, FERPA? A list in the brief helps lawyers know if their framework is supported.

## Demo Script

*"Multi-framework compliance in minutes, not months"* (3 min)

| Step | Action | Say |
|------|--------|-----|
| 1 | Upload 2 policy documents. Select GDPR + HIPAA | "Upload your policies, select your frameworks" |
| 2 | Watch scorecard computing (evaluate_finding repeating) | "AI cross-references every clause against every requirement" |
| 3 | HITL — show scorecard with per-framework scores | "Scores for each framework, findings by domain" |
| 4 | Override one finding status | "Override any finding the AI got wrong — full control" |
| 5 | Show remediation plan | "Priority-ordered action list, ready for the compliance officer" |

**Key moment**: Step 3 — the scorecard grid. Per-framework scores make it immediately clear what's compliant and what isn't.

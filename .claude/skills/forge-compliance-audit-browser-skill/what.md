# Compliance Audit — What It Does

## Purpose

The Compliance Audit analyzes policy documents against regulatory frameworks (GDPR, HIPAA, SOX, etc.) and produces a quantified scorecard with gap analysis and a remediation plan.

## Two Audit Modes

**Mode 1: Compliance Scan (document-driven)**
- Upload policy documents
- AI classifies each document's compliance domain
- Cross-references against selected frameworks
- Outputs: per-framework compliance score, gap list, remediation steps

**Mode 2: Full Audit (theme-question)**
- Select compliance themes/frameworks
- AI generates questions for each theme
- Cross-references policy documents against questions
- More thorough, takes longer — better for formal audit prep

The user toggles between modes with a segment control on the submission form.

## Key Features

1. **Multi-framework simultaneous audit** — run GDPR, HIPAA, and SOX at once
2. **Per-finding status (5 levels)** — compliant, partially compliant, gap, exception, not applicable
3. **Override individual finding statuses** — reviewer can change AI's assessment per finding
4. **Quantified scorecard** — per-theme, per-framework, and overall score
5. **RAG integration** — framework-specific and policy-specific collections
6. **Remediation plan** — structured markdown with priority-ordered action items

## HITL Moment

After the scorecard is computed, the graph pauses. The reviewer sees the full scorecard, all findings by domain and severity. They can:
- Override individual finding statuses (the most powerful feature — not just approve/reject the whole audit)
- Approve → final report generated
- Reject → re-run with updated context

## Output

Inline `ComplianceAuditView` (not a modal):
- Scorecard grid (compliance scores per framework)
- Gap analysis results with finding details
- Remediation plan sorted by priority

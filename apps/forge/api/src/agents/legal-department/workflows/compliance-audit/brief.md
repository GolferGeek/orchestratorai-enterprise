---
title: Compliance Audit
video:
---

## Benefits

- **Audit against real regulatory frameworks, not generic checklists.** Select GDPR, HIPAA, SOX, or any combination — the system evaluates your actual policy documents against the specific requirements of each framework. Every finding maps to a real regulatory obligation, not a vague best practice.

- **Cross-reference every policy section against every framework requirement.** The system segments your policy documents, classifies each section by compliance domain (data handling, security, privacy, breach notification), and evaluates each one against the relevant framework requirements. No gap goes unexamined.

- **RAG-grounded evaluation, not guesswork.** Each finding is grounded in your ingested framework documents and your own policies via hybrid search. The system cites specific policy excerpts and framework requirements — you can trace every conclusion back to its source.

- **Quantified compliance scoring.** Get a per-framework, per-theme, and overall compliance score computed from actual finding statuses. See at a glance where you're compliant, partially compliant, or exposed — prioritized by severity (critical, high, medium, low).

- **You review every finding before the report ships.** The system pauses for your review after evaluation. Approve the findings as-is, reject to re-evaluate with your feedback, or override individual finding statuses. Your judgment is the final word.

## Features

- Two audit modes: document-driven scan (evaluate policy sections) or full-audit (theme-question driven)
- Policy document segmentation with LLM-powered compliance domain classification
- Per-finding severity scoring: critical, high, medium, low
- Per-finding status: compliant, partially compliant, non-compliant, not addressed, unable to evaluate
- RAG integration with framework-specific and policy-specific collections
- Quantified scorecard: per-theme, per-framework, and overall compliance scores
- HITL review gate with approve/reject/modify decisions
- Reject re-runs the evaluation loop with reviewer feedback threaded in
- Modify lets you override individual finding statuses before report generation
- Structured markdown compliance report with remediation plan
- Supports multiple frameworks simultaneously (GDPR + HIPAA + SOX in one audit)

## When to use it

- You need to assess policy compliance against one or more regulatory frameworks
- You want quantified compliance scores, not just a narrative summary
- You're preparing for a regulatory audit and need to identify gaps with specific remediation recommendations
- You want to ensure every policy section has been evaluated against every relevant requirement

## How it works

1. Click **New Audit** and upload your policy documents
2. Select the regulatory frameworks to audit against (GDPR, HIPAA, SOX, etc.)
3. Choose scan mode (document-driven) or full-audit mode (theme-question driven)
4. Watch the cross-reference engine evaluate each policy section against framework requirements
5. Review the findings and scorecard: approve, reject with feedback, or override individual statuses
6. Receive your compliance report with prioritized gaps and remediation recommendations

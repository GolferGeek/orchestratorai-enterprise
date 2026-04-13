# Intention: Regulatory Compliance Audit

## Priority: #5 of 10 Legal Workflows

## What

A General Counsel or compliance officer uploads their company's internal policies and selects one or more regulatory frameworks (GDPR, HIPAA, SOX, CCPA, etc.). The Legal Department cross-references the company's policies against the framework requirements — identifying gaps, conflicts, and weaknesses — and produces a structured compliance gap analysis with remediation recommendations.

Two modes, one workflow:

- **Compliance Scan** — AI-driven discovery. The system reads policy sections and dynamically identifies which regulatory requirements they relate to, what's missing, and where there are conflicts. Fast, exploratory, good for first assessments or new client intake.
- **Full Audit** — guided by structured compliance themes. Each framework has 15-20 compliance themes (data retention, access controls, breach notification, etc.), each with 5-10 key evaluation questions. The system works through every theme systematically, producing a scored compliance posture per theme.

The user clicks "Run a Compliance Audit" in the Legal Department workspace, uploads their policy documents, selects the regulatory framework(s), and chooses the mode. The mode defaults to Compliance Scan. A toggle or upgrade prompt lets them switch to Full Audit for more rigorous results. Both modes produce the same output shape — a compliance report with gap analysis and remediation recommendations — but Full Audit is more systematic and scores by theme.

## Why

### The market gap

The compliance tooling market has a gap between "AI regulatory intelligence" (Compliance.ai, Ascent RegTech — $200-500/month, no structure) and "full GRC platform" (OneTrust, Archer — $200K+/year, requires months of implementation). Mid-market companies, regional firms, and in-house teams building compliance programs have no good option between those extremes.

Our advantage is AI-driven analysis with enough structure to be rigorous. We're not competing with OneTrust on requirement-level tracking — firms that need that already have it. We're offering the gap analysis that tells them what to put into OneTrust, or that tells a smaller firm what they need to fix without OneTrust at all.

### The cross-reference pattern

This workflow shares DNA with Portfolio Sentinel (#6). Both cross-reference internal documents against external regulatory text. The difference is timing:

- **Compliance Audit** is point-in-time: "right now, are we compliant?"
- **Portfolio Sentinel** is continuous: "when the regulatory landscape changes, are we still compliant?"

Building the cross-reference pattern here — where the scope is bounded — validates the approach before Sentinel needs to run it continuously.

### Why two modes share a base

Both modes use the same infrastructure:

| Capability | Compliance Scan | Full Audit |
|---|---|---|
| Policy ingestion + RAG indexing | Same | Same |
| Framework corpus in RAG | Same | Same |
| Cross-reference queries (policy ↔ framework) | Same | Same |
| Specialist evaluation (compliance, privacy, employment, etc.) | Same | Same |
| Gap scoring (compliant / partial / non-compliant / not addressed) | Same | Same |
| Remediation recommendations | Same | Same |
| Report structure | Same | Same + scorecard |
| HITL gate | Same | Same |

The only difference is what drives the analysis:

- **Compliance Scan**: the LLM reads each policy section and queries the framework RAG collection to find related requirements. Open-ended. Discovers gaps the user didn't know to ask about.
- **Full Audit**: a theme config (lightweight — ~15 themes × ~5-10 questions per framework, stored as markdown or JSON) drives directed queries. Each theme is evaluated and scored. The result is a compliance scorecard with per-theme percentages.

One graph, one set of nodes, a mode field on state.

## The shape of the thing

### Shared base: document ingestion

The user uploads company policies (PDFs, DOCX, etc.). These are ingested into a RAG collection scoped to the audit: `compliance-audit-{conversationId}-policies`. Classification identifies document type (policy, handbook, procedure, governance, etc.) and segments into sections by topic.

The user also selects one or more regulatory frameworks. The framework text lives in org-scoped RAG collections (e.g., `framework-gdpr`, `framework-hipaa`). These are pre-populated — we ship with 3-5 frameworks as RAG collections, ingested from the actual regulatory text. Organizations can upload additional frameworks.

### Shared base: cross-reference engine

The core analysis loop:

1. Take a policy section (or a compliance theme question)
2. Query the framework RAG collection: "what requirements relate to this?"
3. Query the policy RAG collection: "what policies address this requirement?"
4. Specialist evaluation: "given this requirement and these policy sections, what's the compliance status?"
5. Score: compliant / partially compliant / non-compliant / not addressed
6. Remediation: "what needs to change to achieve compliance?"

This loop is the same for both modes. The difference is what feeds step 1.

### Compliance Scan mode

The graph iterates over policy sections (similar to DD Room's document dispatcher). For each section:

1. Classify the section's compliance domain (data handling, security, employee rights, etc.)
2. Query framework RAG: "what requirements in [selected frameworks] relate to [domain]?"
3. For each matched requirement, evaluate compliance
4. Record findings

The output is a gap analysis organized by policy section: "Your Data Retention Policy (Section 3.2) partially addresses GDPR Article 5(1)(e) but lacks a defined retention period for marketing data."

### Full Audit mode

The graph iterates over compliance themes from a theme config. For GDPR, the themes might be:

- Data Lawfulness & Consent (Art. 6-7)
- Data Subject Rights (Art. 12-23)
- Data Protection by Design (Art. 25)
- Data Breach Notification (Art. 33-34)
- Data Protection Officer (Art. 37-39)
- International Transfers (Art. 44-49)
- ... (~15 total)

Each theme has 5-10 evaluation questions:

```
Theme: Data Breach Notification
Questions:
- Does the organization have a documented breach notification procedure?
- Does the procedure specify the 72-hour notification window to supervisory authorities?
- Does the procedure cover notification to affected data subjects?
- Is there a breach severity assessment process?
- Are breach records maintained?
```

For each question, the system queries both RAG collections and evaluates. The result is a scored compliance posture per theme.

The theme configs are small — a markdown file per framework. Easy to maintain, easy for firms to customize. We ship 3-5 (GDPR, HIPAA, SOX, CCPA, state employment law). The system works without them (Compliance Scan mode), and with them it's more structured (Full Audit mode).

### HITL gate

After analysis completes, the compliance officer reviews findings. They can:

- Override a compliance assessment with additional context
- Mark a requirement as not applicable
- Flag findings for deeper research (fires Legal Research #2)
- Add context that changes the analysis

Same HITL infrastructure as DD Room.

### Report

Both modes produce the same report structure:

1. **Executive summary** — overall compliance posture, critical gaps count, framework coverage
2. **Compliance scorecard** — per-framework and per-theme scores (Full Audit fills every theme; Compliance Scan shows discovered themes only)
3. **Gap analysis** — per-finding detail with policy citations and requirement citations
4. **Remediation recommendations** — prioritized by severity × effort
5. **Policy-to-requirement mapping** — which policies address which requirements
6. **Appendix: per-finding evidence** — full specialist reasoning

Full Audit adds a filled scorecard with percentages. Compliance Scan shows the same scorecard layout but only for themes where gaps were discovered — with a note that undiscovered themes weren't evaluated and Full Audit would cover them. This is the natural upsell: "We found issues in 8 areas. Run a Full Audit to evaluate all 15 systematically."

### Frontend

**Create Audit modal:**
- File upload area (same pattern as DD Room)
- Framework selector (multi-select from available frameworks)
- Mode toggle: "Compliance Scan" (default) / "Full Audit"
  - When Full Audit is selected, show the theme list for the selected framework(s) with checkboxes to include/exclude specific themes
- Organization context (industry, jurisdiction, size — helps with applicability filtering)

**Audit detail view** (four tabs):
1. **Scorecard** — `ComplianceScorecard.vue`: per-framework compliance percentage bars, per-theme breakdown. Color-coded: green (compliant), yellow (partial), red (non-compliant), gray (not evaluated).
2. **Gap Analysis** — sortable/filterable table of findings. Status column, severity column, framework column. Click to expand with policy evidence + requirement text + specialist reasoning.
3. **Remediation Roadmap** — findings sorted by priority (severity × effort). Effort estimates: small/medium/large.
4. **Report** — rendered markdown, download button.

### Regulatory framework management

Frameworks are RAG collections at the org level. We ship default collections for 3-5 frameworks. The Admin UI (or a future capability) lets organizations:

- Upload additional regulatory text as new framework collections
- The theme configs for Full Audit mode are stored alongside the collection metadata
- A framework without a theme config still works — it just only supports Compliance Scan mode

This means adding a new framework = uploading a PDF + optionally writing a theme config markdown file. No code changes.

## Constraints

- **No compliance guarantees.** The report includes a disclaimer: AI-assisted analysis, not a legal opinion, review by qualified counsel before reliance.
- **Framework accuracy depends on source text quality.** RAG retrieval is only as good as the ingested text. Framework collections should be from primary regulatory sources.
- **No fallbacks on evaluation.** If a requirement can't be evaluated, it's marked "unable to evaluate" with the reason.
- **ExecutionContext is the capsule.** One audit = one job = one conversationId.
- **Sequential on Ollama, parallel on cloud** (same as DD Room).

## Out of scope

- **Heavy/requirement-level GRC tracking.** That's OneTrust's market. We produce the gap analysis that feeds into GRC tools.
- **Continuous monitoring.** That's Portfolio Sentinel (#6).
- **Automated policy drafting.** Remediation recommendations tell you what to change, not how to write it. Future workflow.
- **Custom framework builder UI.** Upload a PDF works for now. A structured builder is future.
- **Certification preparation.** ISO 27001, SOC 2 evidence collection workflows. Future expansion.
- **Cross-organization benchmarking.** Future analytics.

## Dependencies

- Contract Review (#1) — clause segmentation for policy documents (completed)
- Legal Research (#2) — recursive research for deep-dive on ambiguous findings (completed)
- Due Diligence Room (#4) — batch document processing pattern, dispatcher loop (completed)
- Forge RAG Integration — framework collections stored and queried via RAG (completed)
- Legal Department async workspace + HITL (completed)

## Estimated scope

Medium. 2-3 weeks.

- Week 1: Shared base — policy ingestion, framework RAG collections (ship 3: GDPR, HIPAA, SOX), cross-reference engine, specialist evaluation loop, gap scoring
- Week 2: Compliance Scan mode end-to-end, report generation, HITL gate, frontend (create modal + scorecard + gap analysis tabs)
- Week 3: Full Audit mode — theme configs for 3 frameworks, theme-driven evaluation loop, scorecard with per-theme percentages, mode toggle in UI

## Why this goes fifth

- Fills the market gap between cheap AI tools and expensive GRC platforms
- The cross-reference pattern (policy ↔ framework via RAG) is directly reused by Portfolio Sentinel (#6)
- Framework RAG collections become a platform asset — every future compliance-related workflow benefits
- Two modes from shared infrastructure = broad market coverage without doubling the work
- Lower risk than Sentinel (point-in-time vs. continuous) — proves the approach in a bounded context

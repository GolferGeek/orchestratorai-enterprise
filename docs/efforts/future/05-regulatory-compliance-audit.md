# Intention: Regulatory Compliance Audit

## Priority: #5 of 10 Legal Workflows

## What

A General Counsel or compliance officer uploads their company's internal policies, handbooks, procedures, and governance documents. They select a target regulatory framework (GDPR, HIPAA, SOX, CCPA, state employment law, ADA, OSHA, FINRA, etc.) or multiple frameworks. The Legal Department runs a **systematic cross-reference audit** — mapping every requirement in the selected framework(s) against the company's actual policies, identifying gaps (requirements with no corresponding policy), conflicts (policies that contradict requirements), and weaknesses (policies that partially address a requirement but are insufficient).

Output: a structured compliance gap analysis with per-requirement status (compliant / partially compliant / non-compliant / not addressed), specific citations to both the regulatory requirement and the company policy, remediation recommendations for every gap, and a prioritized action plan.

The user clicks "Run a Compliance Audit" in the Legal Department workspace, uploads their policy documents, selects the regulatory framework(s), and gets a job. The detail panel shows the audit progressing through: framework loading → policy indexing → requirement-by-requirement analysis → gap identification → remediation recommendations → report.

## Why

### The universal in-house legal need

Every company with more than 50 employees has compliance obligations they're not fully meeting. The ACC (Association of Corporate Counsel) surveys consistently show that 60-80% of in-house legal teams believe they have compliance gaps they haven't identified. The reason is simple: a thorough compliance audit against even a single regulatory framework requires reading every relevant regulation, mapping it against every relevant internal policy, and evaluating whether the policy actually satisfies the requirement. For GDPR alone, that's 99 articles and 173 recitals against potentially hundreds of internal documents. It takes a team of associates 4-8 weeks and costs $200K-$500K.

### The cross-reference pattern

This workflow shares DNA with Portfolio Sentinel (#6): both cross-reference internal documents against an external regulatory corpus. The difference is timing:

- **Compliance Audit** is a **point-in-time assessment**: "right now, are we compliant?"
- **Portfolio Sentinel** is **continuous monitoring**: "when the regulatory landscape changes, are we still compliant?"

Building the cross-reference pattern here — where the scope is bounded (one audit, one set of frameworks, one set of policies) — validates the approach before Sentinel (#6) needs to run it continuously at scale. The indexing logic, the requirement-to-policy mapping, and the gap scoring all transfer directly.

### The pattern it introduces

**Regulatory framework modeling** — the ability to represent a regulatory framework as a structured set of requirements, each with:
- Requirement ID and text
- Category (data protection, reporting, governance, operational, etc.)
- Applicability criteria (which types of organizations, which jurisdictions, which data types)
- Severity of non-compliance (regulatory fine, criminal liability, civil liability, reputational)

This structured representation is what Portfolio Sentinel (#6) needs to evaluate whether a new regulatory signal affects the client's compliance posture. Building it here means Sentinel can focus on the monitoring and alerting, not on the regulatory modeling.

## The shape of the thing

### Regulatory framework library

The platform maintains a library of **pre-built regulatory frameworks** as structured data. Each framework is a JSON/YAML file containing:

```typescript
interface RegulatoryFramework {
  id: string;                    // e.g., "gdpr", "hipaa", "sox"
  name: string;                  // "General Data Protection Regulation"
  jurisdiction: string;          // "EU", "US-Federal", "US-CA", etc.
  effectiveDate: string;
  requirements: RegulatoryRequirement[];
}

interface RegulatoryRequirement {
  requirementId: string;         // e.g., "GDPR-Art-25"
  title: string;                 // "Data Protection by Design and by Default"
  text: string;                  // Full requirement text
  category: string;              // "data-protection", "governance", etc.
  applicability: string;         // When this requirement applies
  complianceIndicators: string[]; // What a compliant policy looks like
  nonComplianceSeverity: 'critical' | 'high' | 'medium' | 'low';
}
```

**For the initial build**, we ship with 3-5 frameworks:
- GDPR (comprehensive, well-structured, high demand)
- HIPAA (healthcare — large market segment)
- SOX (public companies — high-stakes compliance)
- CCPA/CPRA (California privacy — rapidly evolving)
- State employment law (one state — California or New York — as a template for others)

Each framework is curated by hand (or with LLM assistance + human review) from the actual regulatory text. This is a one-time effort per framework. The frameworks are stored in the database plane, scoped per organization (organizations can customize the framework library, but the defaults ship with the platform).

**Future:** Organizations can create custom frameworks for industry-specific regulations (FINRA for broker-dealers, ITAR for defense contractors, FERPA for educational institutions). The framework builder is a future capability.

### Phase 1: Policy indexing

The company's uploaded documents are indexed:
- Each document is classified by type (policy, handbook, procedure, governance document, contract, other)
- Each document is segmented into sections (using the clause segmentation from Contract Review #1)
- Each section is summarized and categorized by topic (data handling, employee conduct, security, reporting, etc.)
- The result is a **Policy Index**: a searchable mapping of "topic → [policy sections that address it]"

### Phase 2: Requirement-by-requirement analysis

For each requirement in the selected framework(s):

1. **Relevance check** — does this requirement apply to the organization? (Based on the deal context: organization type, jurisdiction, data types handled, industry)
2. **Policy search** — query the Policy Index for sections relevant to this requirement
3. **Compliance evaluation** — an LLM call that receives the requirement text, the relevant policy sections, and the compliance indicators, and produces:
   - Status: compliant / partially compliant / non-compliant / not addressed
   - Evidence: specific policy text that supports the assessment
   - Gaps: what's missing from the policy to achieve full compliance
   - Risk: the consequences of the current compliance posture for this requirement

This is where the specialists come in. Depending on the framework category:
- Privacy requirements → privacy specialist
- Employment requirements → employment specialist
- Corporate governance requirements → corporate specialist
- IP requirements → IP specialist
- General compliance → compliance specialist

Each specialist evaluates the requirements in its domain. The specialist has the same role isolation and domain expertise as in the document analysis workflow, but the task is different: instead of "analyze this contract," it's "evaluate this policy against this requirement."

### Phase 3: Gap identification and cross-requirement analysis

After individual requirements are evaluated, a synthesis node identifies:

- **Systemic gaps** — patterns across multiple requirements (e.g., "the company has no data retention policy, which affects 12 GDPR requirements and 3 HIPAA requirements")
- **Conflicting policies** — internal policies that contradict each other in ways that create compliance risk
- **Cascading risks** — non-compliance in one area that creates exposure in another (e.g., inadequate data protection creates both GDPR and SOX exposure)
- **Quick wins** — requirements where compliance is almost met and the remediation is simple

### Phase 4: Remediation recommendations

For each gap, the system produces:
- **Specific remediation** — what the policy should say, with draft language
- **Effort estimate** — small/medium/large, based on whether it's a policy update, a process change, or a structural change
- **Priority score** — based on non-compliance severity × remediation effort (high-severity + low-effort = fix immediately)
- **Dependencies** — remediations that must happen in sequence

### Phase 5: Report generation

The compliance audit report includes:

1. **Executive summary** — overall compliance posture, framework coverage, critical gaps count
2. **Compliance scorecard** — per-framework compliance percentage, per-category breakdown
3. **Gap analysis** — the per-requirement assessment, organized by severity
4. **Remediation roadmap** — prioritized action plan with effort estimates
5. **Policy-to-requirement mapping** — which policies address which requirements (the reverse view)
6. **Appendix: detailed per-requirement analysis** — full evidence and reasoning for each assessment

### HITL gate

After Phase 3 (gap identification), the compliance officer reviews the findings before remediation recommendations are generated. They can:
- Override a compliance assessment ("we actually do comply with this, here's why: [additional context]")
- Deprioritize a requirement ("this doesn't apply to us because [reason]")
- Flag a requirement for deeper investigation (triggers the recursive research pattern from #2)
- Add context that changes the analysis ("we have a new policy in draft that addresses this")

### Frontend: Compliance Dashboard

The DD room detail panel has four tabs:

1. **Scorecard** — visual compliance percentage per framework and per category. Uses a `ComplianceScorecard.vue` component with color-coded bars.
2. **Gap Analysis** — sortable/filterable table of requirements with their compliance status. Click a row to see the full analysis with policy evidence.
3. **Remediation Roadmap** — the prioritized action plan as a timeline or priority grid.
4. **Report** — the full compliance audit report.

## Constraints

- **No compliance guarantees.** The report is an analytical tool, not a legal opinion. The executive summary must include a disclaimer that the audit is AI-assisted and should be reviewed by qualified legal counsel before reliance.
- **Framework accuracy is critical.** A wrong requirement in the framework file means every audit using that framework is wrong. Frameworks must be curated from primary regulatory sources and version-controlled. AI-generated framework content must be human-verified before inclusion.
- **No fallbacks on requirement evaluation.** If a requirement can't be evaluated (missing policy context, ambiguous requirement text), it's marked "unable to evaluate" with the reason. We do not guess.
- **ExecutionContext is the capsule.** One audit = one job = one conversationId.
- **Multi-framework audits are sequential, not parallel** (on Ollama). On cloud providers, framework evaluations can parallelize.

## Out of scope

- **Custom framework builder.** Organizations create their own regulatory frameworks. Future capability.
- **Continuous compliance monitoring.** That's Portfolio Sentinel (#6). This effort is point-in-time.
- **Automated policy generation.** Drafting new policies to fill gaps. Future workflow that could chain off the remediation recommendations.
- **Regulatory update tracking.** Alerting when a framework requirement changes. Sentinel territory.
- **Cross-organization benchmarking.** "How does our compliance compare to industry peers?" Future analytics.
- **Certification preparation.** ISO 27001, SOC 2, etc. — certification-specific workflows with evidence collection. Future expansion.

## Dependencies

- Contract Review & Redlining (#1) — clause segmentation for policy documents
- Legal Research Deep Dive (#2) — recursive research for deep-dive on ambiguous requirements
- Legal Department async workspace (completed)
- Legal Department HITL (completed)

## Estimated scope

Medium. 2-3 weeks. The regulatory framework library (3-5 frameworks) is the largest single effort — curating accurate, structured frameworks from primary sources. The graph itself is a variant of the document analysis pipeline with a different input (framework requirements) and output (compliance assessments). The compliance scorecard UI is new but straightforward.

## Why this goes fifth

- Shares DNA with Portfolio Sentinel (#6) — the cross-reference pattern validated here powers continuous monitoring next.
- Strong in-house legal demand — every GC needs this and few do it well.
- The regulatory framework library, built here, is directly reused by Sentinel.
- Lower risk than Sentinel (point-in-time vs. continuous) — proves the approach in a bounded context.
- Introduces the structured regulatory framework modeling that becomes a platform asset.

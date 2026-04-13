# Intellectual Property Protection Guide

**ORCHESTRATOR AI LLC**

---

## GUIDE TO INTELLECTUAL PROPERTY PROTECTION IN AI PLATFORM DEPLOYMENTS

**Version:** 1.0
**Last Updated:** [DATE]
**Author:** Legal Operations, Orchestrator AI LLC

---

## TABLE OF CONTENTS

1. Introduction
2. OrchestratorAI's Intellectual Property Portfolio
3. Trade Secret Protection
4. Source Code Security
5. Client Engagement IP Boundaries
6. Contractor and Intern IP Management
7. Open Source Compliance
8. AI-Specific IP Considerations
9. IP Protection in Local Deployments
10. IP Protection in Cloud and Hybrid Deployments
11. Contractual IP Protections
12. Enforcement and Remedies
13. Best Practices Summary
14. Appendices

---

## 1. INTRODUCTION

### 1.1. Purpose

This guide establishes Orchestrator AI LLC's ("OrchestratorAI" or the "Company") policies and best practices for protecting intellectual property in the context of AI platform deployments. It addresses the unique IP challenges that arise when deploying sophisticated AI orchestration software on client hardware, engaging contractors for platform development, and operating a SaaS prediction platform.

### 1.2. Why IP Protection Matters for OrchestratorAI

OrchestratorAI's business model creates specific IP vulnerabilities that must be actively managed:

**Local Deployment Risk.** The Company's core product, the OrchestratorAI platform, is deployed directly on client hardware. Unlike traditional SaaS where the provider controls access to source code, local deployment means the software physically resides on infrastructure outside the Company's direct control. This makes technical and contractual protections essential.

**Contractor Development Risk.** As a single-member LLC that engages 1099 contractors and interns for development, the Company must ensure that all code and innovations created by non-employees are properly assigned to the Company. Unlike W-2 employees, default copyright ownership for contractor-created works does not automatically vest in the hiring party.

**AI Model and Algorithm Risk.** The Company's AI orchestration techniques, agent architectures, RAG implementations, and prediction models (Divinr.ai) represent substantial know-how. These assets may not qualify for patent protection but are highly valuable trade secrets.

**Multi-Party Collaboration Risk.** Platform deployments involve interactions between OrchestratorAI personnel, client personnel, LLM providers (OpenAI, Anthropic, Google), and open source communities. Clear IP boundaries must be established and maintained.

### 1.3. Scope

This guide applies to all OrchestratorAI products and services:
- OrchestratorAI platform (orchestratorai.io)
- Divinr.ai market prediction SaaS
- AI coding training and consulting services
- Custom agent development for clients
- All internal development and research

---

## 2. ORCHESTRATORAI'S INTELLECTUAL PROPERTY PORTFOLIO

### 2.1. IP Asset Categories

| Category | Examples | Protection Mechanism |
|----------|----------|----------------------|
| **Software** | Platform source code, agent frameworks, API libraries, deployment tools | Copyright, trade secret, license restrictions |
| **Algorithms** | Multi-agent orchestration logic, prediction models, RAG pipelines | Trade secret, patent (where applicable) |
| **Architecture** | Provider plane abstraction, execution context pattern, transport types protocol | Trade secret, documentation as evidence |
| **Know-How** | Deployment methodologies, optimization techniques, training curricula | Trade secret, confidentiality agreements |
| **Data** | Divinr.ai training data, model weights, benchmark datasets | Trade secret, database protection |
| **Trademarks** | "OrchestratorAI," "Divinr.ai," logos, product names | Trademark registration, brand guidelines |
| **Content** | Documentation, training materials, marketing content | Copyright |

### 2.2. IP Ownership Inventory

The Company should maintain an IP inventory that catalogues:

1. **Core platform components.** The OrchestratorAI platform architecture, including the NestJS backend, Vue.js frontend, LangGraph workflow engine, provider plane abstractions (database, LLM, storage, observability, RAG, auth, config), transport types protocol, and execution context system.

2. **Divinr.ai components.** Prediction models, data ingestion pipelines, scoring algorithms, risk analysis engines, and the crawler infrastructure.

3. **Training materials.** AI coding curricula, exercises, lab environments, and instructional content.

4. **Deployment tooling.** Installation scripts, configuration generators, security hardening procedures, and benchmark tools.

5. **Third-party licenses.** All third-party software incorporated into Company products, with license type and compliance requirements.

---

## 3. TRADE SECRET PROTECTION

### 3.1. What Qualifies as a Trade Secret

Under the Florida Uniform Trade Secrets Act (Fla. Stat. Section 688.002) and the federal Defend Trade Secrets Act (18 U.S.C. Section 1836), a trade secret is information that:

(a) Derives independent economic value from not being generally known or readily ascertainable; and
(b) Is the subject of efforts that are reasonable under the circumstances to maintain its secrecy.

Both elements must be satisfied. The most common reason trade secret claims fail is inadequate secrecy measures -- not because the information lacked value, but because the owner failed to protect it.

### 3.2. OrchestratorAI's Trade Secrets

The following categories of information are designated as trade secrets:

**Tier 1: Critical Trade Secrets (Highest Protection)**
- Platform source code and architecture
- Divinr.ai prediction algorithms and model weights
- Provider plane abstraction patterns and multi-cloud implementation details
- Execution context and transport protocol designs
- Client deployment configurations and security architectures
- Pricing models and cost structures

**Tier 2: Important Trade Secrets (High Protection)**
- Agent orchestration methodologies
- RAG implementation techniques and optimization approaches
- Performance benchmarking data and optimization techniques
- Deployment playbooks and operational procedures
- Training curricula and proprietary teaching methodologies
- Customer lists and engagement details

**Tier 3: Confidential Business Information (Standard Protection)**
- Business plans and financial projections
- Marketing strategies
- Partnership terms
- Vendor pricing and terms

### 3.3. Required Secrecy Measures

To maintain trade secret status, the following measures must be implemented and documented:

**Organizational Measures:**
- All contractors and interns must execute Non-Disclosure Agreements before accessing any Confidential Information
- All contractors must execute IP Assignment agreements (included in the standard Independent Contractor Agreement)
- Access to trade secrets is limited to those with a documented need-to-know
- All personnel receive trade secret awareness briefing during onboarding
- Exit interviews include trade secret reminder and return/destruction of materials

**Technical Measures:**
- Source code repositories are access-controlled with role-based permissions
- Code repositories are private (not public GitHub)
- Multi-factor authentication required for all development systems
- Audit logging on code repository access
- Encryption at rest and in transit for all trade secret materials
- No trade secret information in public-facing documentation, blog posts, or presentations without review

**Physical Measures:**
- Development hardware stored in secure locations
- Visitor access to development areas restricted
- Clean desk policy for sensitive materials
- Secure disposal of storage media

**Contractual Measures:**
- NDAs with all parties who access trade secrets
- Confidentiality provisions in every engagement agreement
- Non-compete/non-solicitation provisions in contractor agreements
- IP assignment provisions in contractor agreements
- License restrictions preventing reverse engineering, decompilation, and benchmarking

### 3.4. Trade Secret Documentation

Maintain a trade secret log that records:
- Description of the trade secret
- Date identified/created
- Persons with access
- Protection measures in place
- Any disclosures (authorized and unauthorized)
- Economic value assessment (qualitative)

This documentation serves as evidence of reasonable secrecy measures if enforcement becomes necessary.

---

## 4. SOURCE CODE SECURITY

### 4.1. Repository Security

**Access Control:**
- All source code in private repositories (never public)
- Access granted per-repository based on project assignment
- Minimum necessary access level (read vs. write vs. admin)
- Access reviewed quarterly and upon any personnel change
- Two-factor authentication required for all repository access
- SSH key authentication preferred over password authentication

**Branch Protection:**
- Main/production branches require pull request reviews
- Direct pushes to main branch prohibited
- Code reviews required before merge
- Automated security scanning on all pull requests

**Monitoring:**
- Audit logs for all repository access and operations
- Alerts on unusual access patterns (bulk downloads, access from unexpected locations)
- Regular review of access logs

### 4.2. Development Environment Security

**Local Development:**
- Full-disk encryption required on all development machines
- Screen lock after inactivity
- No development on personal devices without Company approval
- VPN required for remote access to development infrastructure

**Cloud Development:**
- Cloud development environments (Codespaces, Gitpod, etc.) must be configured for private access
- Ephemeral environments preferred (destroyed when not in use)
- No persistent storage of source code in cloud environments without encryption

### 4.3. Code in Client Deployments

When the OrchestratorAI platform is deployed on client hardware:

**Obfuscation and Compilation:**
- Deploy compiled/bundled code, not raw source where possible
- TypeScript compiled to JavaScript with source maps excluded from production builds
- Minification and obfuscation applied to frontend code
- Backend deployed as compiled NestJS bundles

**License Enforcement:**
- License validation mechanism verifies active license
- License tied to specific hardware identifiers
- Tamper detection for license validation code
- Regular license audits

**Access Restrictions:**
- Client personnel do not receive access to source code repositories
- Deployment performed by OrchestratorAI personnel or under OrchestratorAI supervision
- Configuration via documented APIs and configuration files, not source code modification
- Platform updates delivered as compiled packages, not source patches

### 4.4. Source Code Escrow

For high-value enterprise clients who require assurance of continued access:

**When to Offer:** Source code escrow may be offered as a negotiated term for Enterprise-tier licenses or contracts exceeding $85,000/year.

**Escrow Terms:**
- Source code deposited with a neutral third-party escrow agent (e.g., Iron Mountain, EscrowTech)
- Release conditions limited to: (a) OrchestratorAI ceases business operations; (b) OrchestratorAI files for bankruptcy; or (c) OrchestratorAI fails to provide contracted support for more than 90 consecutive days
- Released code licensed for maintenance and internal use only, not redistribution or competitive development
- Escrow updated with each major version release

---

## 5. CLIENT ENGAGEMENT IP BOUNDARIES

### 5.1. The IP Boundary Model

Every client engagement involves three distinct IP zones:

```
+----------------------------------+
|     Zone 1: OrchestratorAI IP    |
|  Platform, frameworks, tools,    |
|  algorithms, methodologies       |
|  (Owned by OrchestratorAI)       |
+----------------------------------+
|     Zone 2: Client IP            |
|  Client data, custom content,    |
|  business processes, custom      |
|  agents, configurations          |
|  (Owned by Client)               |
+----------------------------------+
|     Zone 3: Engagement IP        |
|  Custom integrations, custom     |
|  deliverables, joint works       |
|  (Ownership per contract)        |
+----------------------------------+
```

### 5.2. Zone 1: OrchestratorAI IP (Company Retains)

The following always remain OrchestratorAI's property:
- Platform source code and binaries
- Agent frameworks and execution engines
- Provider plane implementations
- Transport protocol and execution context patterns
- Deployment tooling and methodologies
- General training materials and curricula
- Divinr.ai models and algorithms
- General knowledge and expertise (skills developed during engagement)

**Contractual requirement:** Every license agreement must clearly state that the platform IP is licensed, not sold, and remains OrchestratorAI's property.

### 5.3. Zone 2: Client IP (Client Retains)

The following always belong to the client:
- All client data processed through the platform
- Client's pre-existing IP and business processes
- Client-created agents, prompts, and workflows (using the platform's tools)
- Client-created configurations and customizations (through published interfaces)
- Client's RAG knowledge base content

**Contractual requirement:** Every license agreement must clearly state that client data belongs to the client and that OrchestratorAI claims no ownership interest in client data.

### 5.4. Zone 3: Engagement IP (Determined by Contract)

Custom work created during an engagement may fall into a gray area. Resolution depends on the contract:

| Work Product | Default Ownership | Rationale |
|--------------|-------------------|-----------|
| Custom AI agents developed by OrchestratorAI for client | Client (upon full payment) | Custom work paid for by client |
| Integration adapters (client system-specific) | Client (upon full payment) | Specific to client's systems |
| General-purpose tools created during engagement | OrchestratorAI | Reusable across engagements |
| Custom training materials (client-specific) | Joint (client gets license) | Based on OrchestratorAI methodology |
| Architecture designs | Client (upon full payment) | Custom work paid for by client |
| Performance reports and assessments | Client (upon full payment) | Engagement deliverables |

**Critical rule:** When developing custom work for clients, be conscious of what you are creating. If a component is reusable and general-purpose, structure it as OrchestratorAI IP with a license to the client. If it is truly client-specific, assign it.

### 5.5. Feedback and Improvements

When clients suggest improvements to the platform:
- The license agreement should include a feedback clause granting OrchestratorAI an unrestricted right to use feedback
- Document feedback separately from client-specific work
- Implement improvements as part of the general platform, not as client-specific modifications

---

## 6. CONTRACTOR AND INTERN IP MANAGEMENT

### 6.1. The 1099 Contractor IP Problem

Under U.S. copyright law, works created by independent contractors are NOT automatically "works made for hire" unless: (a) they fall within one of nine enumerated categories in the Copyright Act AND (b) the parties have a written agreement designating the work as made for hire.

Software code does not fit neatly into the enumerated categories. Therefore, without proper contractual protections, a 1099 contractor may own the copyright in code they write for OrchestratorAI.

### 6.2. Required Protections

Every contractor agreement must include:

**Work Made for Hire Designation.** To the maximum extent permitted by law, designate all deliverables as works made for hire.

**Belt-and-Suspenders IP Assignment.** Because WFH may not apply, include a comprehensive assignment clause that transfers all IP rights from the contractor to OrchestratorAI. This assignment must cover: copyrights, patent rights, trade secret rights, moral rights, and all other IP rights, worldwide, in perpetuity.

**Power of Attorney.** Include an irrevocable power of attorney authorizing OrchestratorAI to execute assignment documents on the contractor's behalf if the contractor fails to do so.

**Moral Rights Waiver.** To the extent permitted by applicable law, waive moral rights of attribution and integrity.

**Prior Inventions Disclosure.** Require contractors to disclose any pre-existing IP they intend to incorporate, with a license grant for such pre-existing IP.

**Open Source Restrictions.** Prohibit incorporation of open-source software (especially copyleft licenses) without prior written approval.

**Representations.** Contractor represents that work is original, does not infringe third-party IP, and was not created using confidential information from prior engagements.

### 6.3. Intern-Specific Considerations

For interns engaged through university partnership programs:

- Execute the standard Independent Contractor Agreement (with IP assignment) before any work begins
- Verify that the university's internship agreement does not contain conflicting IP provisions
- If the university claims any IP rights (some do for student work), negotiate a resolution before the internship begins
- Document all intern work contributions clearly in version control
- Conduct exit reviews to ensure all work product is properly attributed and assigned

### 6.4. Ongoing Monitoring

- Review all contractor and intern agreements annually for completeness
- Verify IP assignment provisions are current and compliant with law
- Audit code contributions to ensure all contributors have executed proper agreements
- Maintain a register of all IP assignments received

---

## 7. OPEN SOURCE COMPLIANCE

### 7.1. Open Source Risk Categories

| License Type | Risk Level | Examples | Key Restriction |
|--------------|------------|----------|-----------------|
| **Copyleft (Strong)** | HIGH | GPL v2/v3, AGPL | Derivative works must be open-sourced under same license |
| **Copyleft (Weak)** | MEDIUM | LGPL, MPL, EPL | Copyleft applies to the library itself, not the linking application |
| **Permissive** | LOW | MIT, BSD, Apache 2.0 | Attribution required; minimal restrictions |
| **Public Domain** | MINIMAL | CC0, Unlicense | No restrictions |

### 7.2. OrchestratorAI's Open Source Policy

**Prohibited without explicit Managing Member approval:**
- GPL v2 or v3 (any version)
- AGPL (any version)
- Any license with "copyleft" or "share-alike" provisions that could affect the platform

**Permitted with notification:**
- LGPL (if dynamically linked only)
- MPL 2.0 (if used in separate files)
- Any weak copyleft license (with documentation of compliance approach)

**Permitted freely:**
- MIT
- BSD (2-clause and 3-clause)
- Apache 2.0
- ISC
- CC0

### 7.3. Open Source Compliance Procedures

**Before Adding a Dependency:**
1. Identify the license of the component and all transitive dependencies
2. Check the license against the policy above
3. If prohibited or notification-required, obtain appropriate approval
4. Document the component in the project's dependency manifest
5. Verify that license attribution requirements are satisfied

**Ongoing Compliance:**
- Run automated license scanning on all dependency updates
- Review the full dependency tree quarterly
- Maintain a NOTICE file or equivalent attribution document
- Include third-party license information in platform documentation

### 7.4. Contributing to Open Source

OrchestratorAI personnel may contribute to open-source projects under the following conditions:
- The contribution does not include any OrchestratorAI proprietary code or trade secrets
- The contribution does not reveal proprietary techniques or architecture
- Managing Member approval is obtained before contributing to projects in the AI orchestration or market prediction space
- Personal contributions on personal time are not restricted, provided they do not use Company IP

---

## 8. AI-SPECIFIC IP CONSIDERATIONS

### 8.1. AI Model IP

**Model Weights and Parameters.** Trained model weights for Divinr.ai prediction models are trade secrets. They represent the distilled value of training data, algorithms, and computational investment. Protection measures include:
- Weights stored encrypted, with access limited to production systems
- No model weights included in client deployments (clients use API-based LLM providers or their own local models)
- Model architecture documentation classified as Tier 1 trade secret

**Training Data.** The datasets used to train Divinr.ai models are trade secrets. Their compilation, curation, and annotation represent significant investment. Protection measures:
- Training data stored separately from production systems
- Access limited to ML engineering personnel
- Data sources and acquisition methods documented but not publicly disclosed

### 8.2. AI-Generated Content IP

The legal landscape for AI-generated content is evolving. Current guidance:

**U.S. Copyright Office Position.** Works generated entirely by AI without human creative contribution are not copyrightable. However, human-directed AI outputs with sufficient human creative input may be copyrightable.

**OrchestratorAI's Approach:**
- AI-generated code incorporated into the platform should be reviewed, modified, and approved by human developers. The human creative contribution (selection, arrangement, modification) supports copyrightability.
- For client-facing AI outputs, disclaimers in the license agreement clarify that AI outputs are not warranted as original works and may not be independently copyrightable.
- For Divinr.ai predictions, outputs are informational and not claimed as copyrightable works.

### 8.3. LLM Provider IP Considerations

When integrating with third-party LLM providers (OpenAI, Anthropic, Google, Azure):

**Input/Output Rights.** Review each provider's terms regarding:
- Does the provider claim rights to inputs or outputs?
- Does the provider use inputs for model training?
- Are there restrictions on commercial use of outputs?

**Current major provider positions (verify current terms as they change frequently):**
- OpenAI: Customer owns inputs and outputs; no training on API data
- Anthropic: Customer owns inputs and outputs; no training on API data by default
- Google (Vertex AI): Customer owns inputs and outputs
- Azure OpenAI: Customer owns inputs and outputs; Microsoft does not train on customer data

**OrchestratorAI's Obligations:**
- Inform clients of LLM provider terms applicable to their deployment
- Client is responsible for their own LLM provider agreements and API keys
- OrchestratorAI does not provide LLM API keys to clients (clients procure their own)

---

## 9. IP PROTECTION IN LOCAL DEPLOYMENTS

### 9.1. Unique Challenges

Local deployment creates IP protection challenges not present in SaaS:
- The software physically resides on hardware outside OrchestratorAI's control
- The client has physical access to the deployed software
- OrchestratorAI cannot remotely disable the software without contractual authority
- The client's IT personnel may attempt to inspect or modify the software

### 9.2. Technical Protections

**Build and Deployment Pipeline:**
- Deploy compiled, bundled, and minified code (not raw TypeScript source)
- Exclude source maps from production builds
- Exclude development tools, test code, and build scripts from deployment packages
- Strip comments and debugging information from production builds

**Runtime Protections:**
- License validation that verifies active license status
- Hardware binding (license key tied to machine identifiers)
- Encrypted configuration files for sensitive platform settings
- Application-level encryption for platform databases (where feasible)

**Update Mechanism:**
- Updates delivered as compiled packages through a secure channel
- Integrity verification (checksums, signatures) on update packages
- Update process does not expose source code

### 9.3. Contractual Protections

The Software License Agreement must include:
- Express prohibition on reverse engineering, decompilation, and disassembly
- Prohibition on modification of the platform (customization via published APIs only)
- Prohibition on copying except for backup purposes
- Prohibition on sublicensing, redistribution, or transfer
- Prohibition on competitive analysis and benchmarking without consent
- Post-termination deletion requirements with certification
- Audit rights to verify compliance with license terms
- Injunctive relief clause allowing emergency court action for IP violations

### 9.4. Access Management

- OrchestratorAI personnel perform initial deployment and configuration
- Client IT receives admin access for user management and configuration, not system-level access to platform internals
- Platform updates are installed by OrchestratorAI or under OrchestratorAI guidance
- Remote support sessions are initiated by the client and logged

---

## 10. IP PROTECTION IN CLOUD AND HYBRID DEPLOYMENTS

### 10.1. Cloud Deployment Considerations

If OrchestratorAI offers cloud-hosted deployments in the future:
- Platform runs on OrchestratorAI-controlled infrastructure (preferred)
- Client accesses via web interface only, no access to underlying infrastructure
- Standard SaaS IP protections apply (no software delivered to client)
- Data processing governed by DPA
- Provider (AWS, Azure, GCP) terms reviewed for IP implications

### 10.2. Hybrid Deployment Considerations

Hybrid deployments (some components local, some cloud) require:
- Clear delineation of which components are local vs. cloud
- IP protections appropriate to each component's deployment model
- Data flow mapping to understand what data moves between environments
- Encryption for all data in transit between local and cloud components

---

## 11. CONTRACTUAL IP PROTECTIONS

### 11.1. Standard IP Clauses Across Agreement Types

| Agreement Type | Key IP Provisions |
|----------------|-------------------|
| **Independent Contractor** | WFH + Assignment + Moral rights waiver + Prior inventions + OSS restrictions |
| **Software License** | License (not sale) + Reverse engineering prohibition + No modifications + Deletion on termination |
| **MSA/SOW** | IP ownership for deliverables + License to incorporated OrchestratorAI IP + Feedback clause |
| **NDA** | Trade secret protection + Return/destruction + Survival period |
| **Partnership** | Each party retains own IP + Joint works provisions + Trademark license |
| **Consulting/Training** | Consultant retains methodology + Custom deliverables to client + Joint ownership of custom curricula |

### 11.2. Non-Negotiable IP Provisions

These provisions must be present in every agreement and may not be waived:

1. OrchestratorAI retains ownership of the platform source code and architecture
2. Contractors assign all work-product IP to OrchestratorAI
3. Confidentiality obligations cover all trade secrets
4. Reverse engineering is prohibited in all license agreements
5. Client data ownership is preserved (client owns their data)
6. Open source compliance obligations are specified for contractors

### 11.3. Negotiation Red Lines

Reject or escalate any contractual provision that would:
- Transfer ownership of the OrchestratorAI platform or its components to a client
- Grant a client rights to redistribute, sublicense, or resell the platform
- Allow a client to use the platform to develop a competing product
- Require OrchestratorAI to disclose source code (except through escrow with limited release conditions)
- Waive OrchestratorAI's right to seek injunctive relief for IP violations
- Allow a client to claim ownership of AI orchestration techniques or architectures used in their deployment
- Restrict OrchestratorAI from using general knowledge or non-client-specific techniques in other engagements

---

## 12. ENFORCEMENT AND REMEDIES

### 12.1. Monitoring for IP Violations

**Internal Monitoring:**
- Quarterly review of contractor compliance with IP obligations
- Annual audit of open-source compliance
- Review of code repositories for unauthorized forks or copies
- Monitoring for OrchestratorAI code appearing in public repositories

**External Monitoring:**
- Periodic searches for OrchestratorAI platform code in public repositories (GitHub, GitLab, Bitbucket)
- Google alerts for OrchestratorAI trade secret terms and proprietary methodology names
- Monitoring of competitor products for potential misappropriation
- Review of former contractor portfolios and new employer products

### 12.2. Response Protocol

**Upon Discovery of Potential IP Violation:**

1. **Preserve Evidence.** Screenshot, download, and timestamp all evidence. Do not alert the potential infringer before preserving evidence.

2. **Assess the Violation.** Determine: (a) what IP is affected; (b) who is responsible; (c) the scope and impact; (d) whether it is a contractual breach, trade secret misappropriation, copyright infringement, or other violation.

3. **Engage Legal Counsel.** Contact external IP counsel immediately for serious violations. Counsel can advise on preservation requirements, cease-and-desist strategy, and litigation options.

4. **Send Cease and Desist.** For clear violations, send a formal cease-and-desist letter demanding: (a) immediate cessation of infringing activity; (b) return or destruction of all infringing materials; (c) written confirmation of compliance; and (d) preservation of evidence for potential legal action.

5. **Pursue Legal Remedies.** Available remedies include:
   - Injunctive relief (court order to stop the violation)
   - Damages for trade secret misappropriation (actual damages + unjust enrichment)
   - Statutory damages for copyright infringement
   - Attorney's fees (available under DTSA and Copyright Act)
   - Criminal referral (for willful trade secret theft under DTSA)

### 12.3. Available Legal Frameworks

| Framework | Applies To | Key Provisions |
|-----------|------------|----------------|
| **Defend Trade Secrets Act (DTSA)** | Trade secret misappropriation | Federal cause of action, ex parte seizure, 3-year statute of limitations |
| **Florida UTSA** | Trade secret misappropriation | State cause of action, injunctive relief + damages |
| **Copyright Act** | Code copying, unauthorized distribution | Registration required for statutory damages; actual damages always available |
| **Computer Fraud and Abuse Act (CFAA)** | Unauthorized access to computer systems | Federal criminal and civil liability |
| **Contractual Claims** | Breach of NDA, license, IC agreement | Damages + specific performance + injunctive relief |

---

## 13. BEST PRACTICES SUMMARY

### 13.1. Immediate Actions (Do Now)

- [ ] Audit all active contractor agreements for IP assignment provisions
- [ ] Verify all code contributors have executed proper agreements
- [ ] Ensure source code repositories are private and access-controlled
- [ ] Run open-source license scan on all dependencies
- [ ] Establish a trade secret log for Tier 1 and Tier 2 trade secrets
- [ ] Review deployment packages to ensure source code is not exposed in production builds

### 13.2. Ongoing Practices

- [ ] Execute IP assignment before any contractor writes code (not after)
- [ ] Review and approve all open-source dependencies before incorporation
- [ ] Conduct quarterly access reviews on all code repositories
- [ ] Include IP provisions in every client engagement agreement
- [ ] Conduct exit reviews for all departing contractors
- [ ] Monitor for unauthorized use of Company code and trade secrets
- [ ] Update templates when IP law evolves (especially AI-related developments)
- [ ] Maintain trade secret secrecy measures documentation

### 13.3. Annual Reviews

- [ ] Full IP portfolio review and valuation assessment
- [ ] Contractor agreement audit (all agreements current and compliant)
- [ ] Open-source compliance audit (all dependencies properly licensed)
- [ ] Trade secret measures adequacy review
- [ ] Insurance coverage review (IP-related coverage)
- [ ] Competitive landscape monitoring for potential misappropriation
- [ ] Template update review (incorporate legal developments)

---

## 14. APPENDICES

### Appendix A: IP Protection Quick Reference by Scenario

**Scenario 1: Onboarding a New 1099 Developer**
1. Execute Independent Contractor Agreement (with IP assignment) -- BEFORE any access
2. Execute NDA -- BEFORE any access
3. Collect W-9
4. Grant repository access (minimum necessary)
5. Conduct IP and trade secret awareness briefing
6. Document Prior Inventions disclosure

**Scenario 2: Deploying Platform at Client Site**
1. Software License Agreement executed (with reverse engineering prohibition)
2. DPA executed (if personal data involved)
3. Deploy compiled/bundled code (not source)
4. License validation configured and verified
5. Client admin access configured (not system-level)
6. Document configuration without exposing proprietary details
7. Verify deployment package does not contain source maps or development artifacts

**Scenario 3: Client Requests Source Code Access**
1. Default position: decline. Explain that the license grants usage rights, not source access.
2. If client insists (for security review, business continuity): offer source code escrow with limited release conditions.
3. If source code review is essential: conduct on-site review in a controlled environment with NDA, no copying, and OrchestratorAI personnel present.
4. Never provide source code repository access to clients.

**Scenario 4: Contractor Leaves the Engagement**
1. Confirm all work product delivered to Company
2. Review code contributions in version control
3. Revoke all system access (repositories, development environments, communication tools)
4. Collect/verify destruction of Company materials on personal devices
5. Obtain written certification of return/destruction
6. Remind contractor of surviving confidentiality and non-compete obligations
7. Document exit in contractor file

**Scenario 5: Incorporating a New Open Source Library**
1. Identify the library's license
2. Check against the OSS policy (Section 7.2)
3. If prohibited: find an alternative or seek Managing Member approval
4. If permitted: add to dependency manifest with license notation
5. Verify attribution requirements are satisfied
6. Check transitive dependencies for license compliance

### Appendix B: Key IP Statutes Reference

| Statute | Citation | Relevance |
|---------|----------|-----------|
| Copyright Act | 17 U.S.C. Sections 101-1332 | Software copyright, work made for hire |
| Defend Trade Secrets Act | 18 U.S.C. Sections 1836-1839 | Federal trade secret protection |
| Florida UTSA | Fla. Stat. Sections 688.001-688.009 | State trade secret protection |
| Computer Fraud and Abuse Act | 18 U.S.C. Section 1030 | Unauthorized computer access |
| Patent Act | 35 U.S.C. Sections 1-390 | Patent protection (if applicable) |
| Lanham Act | 15 U.S.C. Sections 1051-1141 | Trademark protection |
| DMCA | 17 U.S.C. Section 1201 | Anti-circumvention (license validation) |

### Appendix C: IP Incident Response Contacts

| Role | Contact | When to Engage |
|------|---------|----------------|
| Managing Member | [NAME] | All IP incidents |
| External IP Counsel | [NAME, FIRM] | Trade secret theft, copyright infringement, patent claims |
| External Corporate Counsel | [NAME, FIRM] | Contract breaches, enforcement actions |
| Law Enforcement | FBI IC3 / Local FBI field office | Criminal trade secret theft (DTSA criminal provisions) |

---

*This guide is maintained by the Managing Member of Orchestrator AI LLC and should be reviewed and updated at least annually. All personnel, contractors, and partners with access to Company intellectual property should be familiar with applicable sections.*

*This document is provided for informational purposes. Orchestrator AI LLC recommends consulting with qualified intellectual property counsel for specific IP matters.*

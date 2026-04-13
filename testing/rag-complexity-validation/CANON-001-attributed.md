---
**Document ID:** CANON-001
**Version:** 1.0
**Effective Date:** January 15, 2026
**Classification:** Internal — Restricted
**Owner:** Chief Information Security Officer (CISO)
**Approved By:** Board of Directors, OrchestratorAI LLC
**Review Cycle:** Annual
---

# Orchestrator AI Data Classification Policy

## Purpose and Scope

This Data Classification Policy ("Policy") establishes the framework by which OrchestratorAI LLC ("Company," "OrchestratorAI," or "we"), a Florida limited liability company with principal operations in Minneapolis, Minnesota, classifies, handles, stores, and disposes of information assets. This Policy applies to all employees, contractors, agents, and third-party service providers who access, process, or manage Company data in any form.

The objectives of this Policy are to: (a) ensure that information assets receive an appropriate level of protection commensurate with their sensitivity; (b) establish clear responsibilities for data handling at each classification tier; (c) maintain compliance with applicable federal, state, and international regulations; and (d) support the Company's AI-driven operations while preserving data integrity and confidentiality.

---

## Article I — Definitions

### Section 1.1 — Key Terms

For purposes of this Policy, the following definitions shall apply:

**"Confidential Information"** means any non-public information that, if disclosed without authorization, could cause material harm to the Company, its clients, or its partners. This includes, without limitation, trade secrets, proprietary algorithms, model weights, training datasets, client lists, financial projections, and strategic plans.

**"Data Controller"** means the natural or legal person, public authority, agency, or other body which, alone or jointly with others, determines the purposes and means of the processing of personal data. Within OrchestratorAI, the Data Controller for all internal data processing activities is the CISO or their designated representative.

**"Data Processor"** means a natural or legal person, public authority, agency, or other body which processes personal data on behalf of the Data Controller. Third-party AI model providers, cloud infrastructure vendors, and managed service providers acting under contract with OrchestratorAI are Data Processors.

**"Data Custodian"** means the individual or team responsible for the technical management and safeguarding of data assets, including storage, backup, access control implementation, and monitoring. The Engineering Operations team serves as Data Custodian for production systems.

**"Data Owner"** means the business unit leader or designated individual who has accountability for a specific data asset, including decisions about its classification level, authorized access, retention period, and disposal method.

**"Personal Data"** means any information relating to an identified or identifiable natural person, consistent with the definition provided under the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), and applicable state privacy laws.

**"Sensitive Personal Data"** means Personal Data that reveals racial or ethnic origin, political opinions, religious or philosophical beliefs, trade union membership, genetic data, biometric data, health data, or data concerning a natural person's sex life or sexual orientation.

**"AI Model Artifacts"** means trained model weights, fine-tuned adapters, inference configurations, prompt templates, evaluation benchmarks, and any derivative works produced by the Company's machine learning pipelines.

**"Sovereign Mode"** means an operational configuration in which all data processing, model inference, and storage occur within a defined jurisdictional boundary, with no data egress permitted beyond that boundary.

---

## Article II — Classification Tiers

### Section 2.1 — Tier Definitions

All information assets owned, managed, or processed by OrchestratorAI shall be classified into one of the following four tiers:

#### Section 2.1.1 — Tier 1: Public

Information explicitly approved for unrestricted public dissemination. Examples include published marketing materials, open-source code contributions, public API documentation, and press releases. No access controls are required beyond integrity verification.

#### Section 2.1.2 — Tier 2: Internal

Information intended for use within OrchestratorAI but not intended for public disclosure. Unauthorized external disclosure would cause minor reputational or operational impact. Examples include internal meeting notes, project status updates, non-sensitive operational metrics, and general employee communications.

#### Section 2.1.3 — Tier 3: Confidential

Information whose unauthorized disclosure could cause significant harm to the Company, its clients, or its partners. This tier includes **Confidential Information** as defined in Section 1.1, client engagement details, non-public financial data, security vulnerability reports, audit findings, and internal architecture documentation. Access is restricted to individuals with a documented business need.

#### Section 2.1.4 — Tier 4: Restricted

The most sensitive category of information. Unauthorized disclosure could cause severe, potentially irreversible harm, including regulatory penalties, litigation, loss of competitive advantage, or compromise of individual privacy. Examples include **Sensitive Personal Data**, production database credentials, encryption keys, **AI Model Artifacts** designated as proprietary, sovereign-mode client data, and executive strategic communications. Access requires explicit written authorization from the **Data Owner** and the CISO.

### Section 2.2 — Default Classification

All newly created or acquired information assets shall be classified as Tier 3 (Confidential) by default until the **Data Owner** assigns a formal classification. This default-secure approach ensures that unclassified data receives appropriate protection during the classification process.

### Section 2.3 — Reclassification

The **Data Owner** may reclassify an information asset at any time by submitting a Classification Change Request through the Company's governance portal. Reclassification from a lower tier to a higher tier takes effect immediately upon submission. Reclassification from a higher tier to a lower tier requires approval from the CISO and a 30-day review period during which the asset remains at the higher classification level.

---

## Article III — Handling Requirements

### Section 3.1 — Access Controls

#### Section 3.1.1 — Authentication

All access to Tier 2, Tier 3, and Tier 4 information assets shall require multi-factor authentication (MFA). Single-factor authentication is permitted only for Tier 1 (Public) assets. The Company's Auth service (as defined in the system architecture) shall enforce authentication requirements uniformly across all products and services.

#### Section 3.1.2 — Authorization

Access to information assets shall be granted on a least-privilege basis. Role-based access control (RBAC) shall be the primary authorization mechanism, supplemented by attribute-based access control (ABAC) for Tier 4 assets requiring contextual evaluation (e.g., time-of-day restrictions, geographic constraints, device compliance).

#### Section 3.1.3 — Access Reviews

The **Data Custodian** shall conduct quarterly access reviews for Tier 3 and Tier 4 assets. Annual access reviews are required for Tier 2 assets. Access that is no longer justified by a documented business need shall be revoked within five (5) business days of the review finding.

### Section 3.2 — Storage and Encryption

#### Section 3.2.1 — Encryption at Rest

All Tier 3 and Tier 4 data shall be encrypted at rest using AES-256 or an equivalent algorithm approved by the CISO. Tier 2 data should be encrypted at rest where technically feasible. Tier 1 data does not require encryption at rest.

#### Section 3.2.2 — Encryption in Transit

All data transmitted over networks, regardless of classification tier, shall be encrypted in transit using TLS 1.2 or higher. Internal service-to-service communication within the Company's infrastructure shall use mutual TLS (mTLS) for Tier 3 and Tier 4 data.

#### Section 3.2.3 — Key Management

Encryption keys for Tier 4 data shall be managed through a dedicated key management service (KMS) with hardware security module (HSM) backing. Key rotation shall occur every 90 days for Tier 4 keys and every 180 days for Tier 3 keys. The **Data Custodian** is responsible for key lifecycle management.

### Section 3.3 — Transmission and Sharing

#### Section 3.3.1 — Internal Sharing

Tier 1 and Tier 2 data may be shared freely among authenticated Company personnel. Tier 3 data may be shared only with individuals who have a documented business need and appropriate RBAC permissions. Tier 4 data sharing requires written authorization from the **Data Owner** and must be logged in the access audit trail.

#### Section 3.3.2 — External Sharing

External sharing of Tier 3 and Tier 4 data requires execution of a Non-Disclosure Agreement (NDA) or equivalent contractual protection. All external data transfers must be approved by the Legal department and logged in the data transfer register. Tier 4 data may not be transmitted to jurisdictions lacking adequate data protection frameworks unless **Sovereign Mode** processing is employed.

#### Section 3.3.3 — AI Model Data Handling

Data used for training, fine-tuning, or evaluating **AI Model Artifacts** shall be classified and handled according to the highest classification tier of any data element contained within the dataset. Model inference requests and responses containing Tier 3 or Tier 4 data shall be processed in isolated environments with no persistent logging of input/output content unless required for compliance.

### Section 3.4 — Retention and Disposal

#### Section 3.4.1 — Retention Periods

The **Data Owner** shall establish retention periods for each information asset based on business need, regulatory requirements, and contractual obligations. In the absence of a specific retention determination, the following default periods apply:

- **Tier 1 (Public):** Retained indefinitely or until superseded
- **Tier 2 (Internal):** 3 years from creation date
- **Tier 3 (Confidential):** 7 years from creation date or as required by applicable regulation
- **Tier 4 (Restricted):** 7 years from creation date, subject to legal hold requirements

#### Section 3.4.2 — Disposal Methods

Upon expiration of the retention period, data shall be disposed of using methods appropriate to its classification tier:

- **Tier 1 and Tier 2:** Standard deletion from all storage media
- **Tier 3:** Secure deletion using NIST SP 800-88 compliant methods, with disposal certification
- **Tier 4:** Cryptographic erasure or physical destruction of storage media, with disposal certification and witness verification

---

## Article IV — AI-Specific Provisions

### Section 4.1 — Model Training Data Governance

All datasets used for training or fine-tuning Company **AI Model Artifacts** shall undergo a Data Classification Assessment prior to ingestion into any training pipeline. The assessment shall identify the highest classification tier of data present, verify that appropriate consent and licensing authorizations exist, and confirm that the intended use is consistent with the data's original collection purpose.

### Section 4.2 — Inference Pipeline Controls

Production inference pipelines processing Tier 3 or Tier 4 data shall implement the following controls: (a) input validation to prevent prompt injection and data exfiltration attacks; (b) output filtering to prevent inadvertent disclosure of classified information; (c) request-level audit logging with ExecutionContext tracing; and (d) rate limiting to prevent bulk data extraction.

### Section 4.3 — Sovereign Mode Requirements

When operating in **Sovereign Mode**, the following additional requirements apply: (a) all model inference shall occur on infrastructure physically located within the designated jurisdiction; (b) no data, including telemetry and performance metrics, shall egress the jurisdictional boundary; (c) model artifacts deployed in sovereign environments shall be versioned and audited independently; and (d) the **Data Controller** shall maintain a register of all sovereign-mode deployments.

### Section 4.4 — Third-Party Model Providers

Use of third-party model providers (e.g., OpenAI, Anthropic, Google, Azure AI) for processing Company data is subject to the following constraints: (a) Tier 4 data shall not be sent to third-party model providers unless the provider has executed a Data Processing Agreement (DPA) with terms equivalent to or exceeding this Policy; (b) Tier 3 data may be sent to approved third-party providers listed in the Company's Vendor Security Register; (c) all third-party model provider integrations shall use the Company's LLM Service plane to ensure consistent access controls, observability, and cost attribution.

---

## Article V — Compliance and Enforcement

### Section 5.1 — Compliance Monitoring

The CISO shall establish a continuous monitoring program to verify compliance with this Policy. Monitoring activities shall include automated classification scanning, access pattern analysis, encryption compliance verification, and periodic manual audits.

### Section 5.2 — Incident Response

Any suspected or confirmed unauthorized disclosure of Tier 3 or Tier 4 data shall be reported immediately to the CISO and managed in accordance with the Company's Incident Response Procedures [CANON-003]. The incident response team shall assess the scope and impact of the disclosure, implement containment measures, and initiate notification procedures as required by applicable law.

### Section 5.3 — Violations

Violations of this Policy may result in disciplinary action up to and including termination of employment or contract. Intentional or grossly negligent violations that result in unauthorized disclosure of Tier 4 data may also result in civil or criminal liability, to the extent permitted by applicable law.

### Section 5.4 — Exceptions

Exceptions to any provision of this Policy may be granted by the CISO in writing, for a defined period not to exceed 180 days, upon a documented risk assessment demonstrating that compensating controls provide equivalent protection. All exceptions shall be logged in the Policy Exception Register and reviewed at each renewal.

---

## Article VI — Governance

### Section 6.1 — Policy Ownership

This Policy is owned by the CISO and shall be reviewed at least annually or upon any material change in the Company's data processing activities, regulatory environment, or organizational structure.

### Section 6.2 — Amendment Procedure

Amendments to this Policy require approval from the CISO and notification to the Board of Directors. Material amendments affecting Tier 4 handling requirements require Board approval prior to implementation.

### Section 6.3 — Related Documents

This Policy should be read in conjunction with the following Company documents:

- Acceptable Use and Security Standards [CANON-002]
- Incident Response Procedures [CANON-003]
- Business Continuity Plan [CANON-004]
- Employee Handbook — Information Security Section
- Vendor Security Assessment Framework

---

*Adopted by the Board of Directors of OrchestratorAI LLC on January 15, 2026.*
*This document supersedes all prior data classification policies and guidelines.*

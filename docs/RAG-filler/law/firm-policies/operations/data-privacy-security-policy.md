# Data Privacy and Security Policy

**Policy Number:** OAI-OPS-002
**Effective Date:** January 1, 2026
**Last Revised:** April 1, 2026
**Policy Owner:** Chief Technology Officer / Managing Member
**Approved By:** Managing Member, Orchestrator AI LLC

---

## 1. Purpose

This Data Privacy and Security Policy ("Policy") establishes the comprehensive framework governing how Orchestrator AI LLC ("the Company") collects, processes, stores, protects, and disposes of personal data, client data, and proprietary information. The Company operates an AI-powered orchestration platform that processes highly sensitive data for clients in the legal, financial, and technology sectors, necessitating security standards that meet or exceed industry best practices.

This Policy is designed to:

(a) Protect the confidentiality, integrity, and availability of all data entrusted to the Company.

(b) Establish security controls commensurate with the sensitivity of data processed through the OrchestratorAI platform, Divinr.ai, and associated services.

(c) Ensure compliance with applicable privacy and data protection laws, including the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), the Florida Information Protection Act (FIPA), and the Minnesota Government Data Practices Act.

(d) Define incident response and breach notification procedures.

(e) Maintain client confidence that their legal documents, financial data, and proprietary information are protected with the highest standards of care.

---

## 2. Scope

This Policy applies to:

- **All personnel:** The Managing Member, all independent contractors (1099), interns, and any third parties with access to Company data or systems.
- **All data:** Personal data, client data, proprietary business information, platform telemetry, financial records, and any other information processed, stored, or transmitted by Company systems.
- **All systems:** The OrchestratorAI platform and its microservices, Divinr.ai, local inference hardware, cloud services, databases, network infrastructure, communication tools, and any third-party services integrated with Company operations.
- **All locations:** Company home office, remote work locations, client premises, and any location from which Company systems are accessed.

---

## 3. Definitions

**Personal Data:** Any information relating to an identified or identifiable natural person, as defined under GDPR Article 4(1) and consistent with CCPA definitions of "personal information."

**Client Data:** All information, documents, communications, and data provided by or generated on behalf of clients through the Company's services, including legal documents, financial records, AI model inputs and outputs, and engagement records.

**Data Controller:** The entity that determines the purposes and means of processing personal data. For client engagement data, the client is typically the Data Controller, and the Company acts as Data Processor.

**Data Processor:** The entity that processes personal data on behalf of the Data Controller. The Company acts as Data Processor when processing client data.

**Processing:** Any operation performed on data, whether automated or manual, including collection, recording, organization, storage, adaptation, retrieval, consultation, use, disclosure, dissemination, alignment, combination, restriction, erasure, and destruction.

**Data Breach:** A security incident resulting in the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, personal data or client data.

**Encryption at Rest:** The encryption of data stored on disk, in databases, or in backup media, such that the data is unintelligible without the appropriate decryption key.

**Encryption in Transit:** The encryption of data during transmission between systems, services, or networks, preventing interception or modification during transport.

**Sovereign Mode:** A deployment configuration in which all data processing occurs on local hardware without data transmission to external cloud services, providing maximum data sovereignty for clients with strict data residency requirements.

---

## 4. Data Classification

### 4.1 Classification Levels

All data processed by the Company shall be classified into one of the following categories:

**Level 4 — Restricted:** Data whose unauthorized disclosure would cause severe harm. Includes: client legal documents under attorney-client privilege, financial account credentials, API keys and secrets, encryption keys, personally identifiable information (PII) subject to regulatory protection.

**Level 3 — Confidential:** Data whose unauthorized disclosure would cause significant harm. Includes: client business data, AI model outputs containing client-specific information, Divinr.ai prediction models and algorithms, proprietary source code, contractor compensation details.

**Level 2 — Internal:** Data intended for internal use only. Includes: internal communications, development documentation, non-sensitive configuration files, aggregate platform metrics.

**Level 1 — Public:** Data approved for public disclosure. Includes: published marketing materials, public-facing documentation, open-source code (if applicable), published blog posts.

### 4.2 Classification Responsibilities

(a) The Managing Member is responsible for the overall data classification framework and for classifying data where classification is ambiguous.

(b) All personnel are responsible for handling data in accordance with its classification level.

(c) When in doubt, data shall be treated at the higher classification level until formally classified.

---

## 5. Security Controls

### 5.1 Local Deployment Security

The Company's primary deployment model emphasizes local infrastructure for maximum data security:

#### 5.1.1 Hardware Security

(a) **Mac Studio (Enterprise Platform):** The primary Mac Studio hosting the OrchestratorAI Enterprise platform shall be physically secured in the Company's home office. FileVault full-disk encryption shall be enabled. The machine shall be connected to an uninterruptible power supply (UPS) with a minimum of thirty (30) minutes of battery runtime.

(b) **NVIDIA DGX Spark (Divinr.ai):** The DGX Spark hosting the Divinr.ai platform shall be similarly physically secured. LUKS full-disk encryption or equivalent shall be enabled. Access shall be limited to authorized personnel.

(c) **Physical Access:** All server hardware shall be located in a secured area of the home office. Visitors shall not be granted unescorted access to areas containing server hardware.

(d) **Hardware Inventory:** A current inventory of all hardware assets shall be maintained, including serial numbers, configurations, and assigned custodians.

#### 5.1.2 Network Security

(a) **Tailscale Mesh Network:** All inter-machine communication between the Mac Studio and DGX Spark shall occur over the Tailscale WireGuard mesh network, providing end-to-end encryption. Direct exposure of internal services to the public internet is prohibited except through approved gateways.

(b) **Cloudflare Gateway:** All public-facing services (orchestratorai.io, divinr.ai) shall be served through Cloudflare, providing DDoS protection, WAF (Web Application Firewall), and TLS termination.

(c) **Nginx Reverse Proxy:** Internal service routing shall be managed through nginx reverse proxy configurations. Direct access to internal service ports from external networks is prohibited.

(d) **Firewall Configuration:** The home network shall employ a firewall configured to deny all inbound connections by default, with exceptions only for Tailscale, Cloudflare tunnel traffic, and explicitly approved services.

(e) **Network Segmentation:** Client workloads shall be logically segmented through Supabase schema isolation (organizational boundaries enforced via orgSlug) and, where applicable, separate network namespaces.

### 5.2 Client Data Isolation

(a) **Organizational Boundaries:** The OrchestratorAI platform enforces data isolation through organizational slugs (orgSlug) embedded in the ExecutionContext that flows through every service invocation. All database queries, API calls, and service operations are scoped to the requesting organization.

(b) **Database Schema Isolation:** Client data is stored in Supabase PostgreSQL databases with row-level security (RLS) policies enforcing organizational boundaries. Schemas include: public, prediction, crawler, risk, marketing, and orch_flow, each with RLS policies scoped to the authenticated user's organization.

(c) **Execution Context Integrity:** The ExecutionContext capsule (orgSlug, userId, conversationId, agentSlug, agentType, provider, model, sovereignMode) is immutable for the life of each invocation and provides a complete audit trail of all operations performed on behalf of each client.

(d) **Cross-Client Access Prevention:** No platform service shall allow queries or operations that span multiple organizational boundaries. Any attempt to access data outside the authenticated user's organization shall be denied and logged as a security event.

(e) **Sovereign Mode:** For clients requiring maximum data isolation, the platform supports Sovereign Mode, in which all LLM inference occurs on local hardware (Mac Studio or DGX Spark) without any data being transmitted to external API providers.

### 5.3 Encryption

#### 5.3.1 Encryption at Rest

(a) All local storage volumes containing client data shall employ full-disk encryption (FileVault on macOS, LUKS on Linux).

(b) Supabase PostgreSQL databases shall be configured with transparent data encryption (TDE) where available, or rely on full-disk encryption of the underlying storage.

(c) Database backups shall be encrypted before storage using AES-256 encryption.

(d) API keys, secrets, and credentials stored in environment files (.env) shall be protected by file system permissions (mode 600) and full-disk encryption.

#### 5.3.2 Encryption in Transit

(a) All external communications shall use TLS 1.2 or higher. TLS 1.0 and 1.1 are prohibited.

(b) All inter-service communications within the Tailscale mesh shall use WireGuard encryption.

(c) All API calls to external LLM providers shall use HTTPS/TLS.

(d) All client-facing web interfaces shall be served over HTTPS with valid certificates managed through Cloudflare.

(e) Database connections shall use SSL/TLS. Unencrypted database connections are prohibited in production.

### 5.4 Access Controls

(a) **Authentication:** All access to Company systems shall be authenticated through the Auth service. The Auth service shall enforce:
  - Minimum password complexity (12 characters, mixed case, numbers, symbols)
  - Account lockout after five (5) consecutive failed login attempts
  - Session timeout after thirty (30) minutes of inactivity
  - Multi-factor authentication for administrative and production access

(b) **Authorization:** Access permissions shall follow the principle of least privilege. The Admin service shall be used to manage roles, entitlements, and organizational access assignments.

(c) **API Authentication:** All API endpoints shall require valid JWT tokens issued by the Auth service. Tokens shall have a maximum lifetime of eight (8) hours.

(d) **Database Access:** Direct database access shall be restricted to the Managing Member and designated database administrators. Application services shall access the database exclusively through the Database Plane (packages/planes/database/).

(e) **Third-Party Access:** Third-party service accounts shall have the minimum permissions necessary and shall be reviewed quarterly.

### 5.5 Logging and Monitoring

(a) All platform operations shall generate audit logs through the Observability Plane (packages/planes/observability/).

(b) Logs shall capture: timestamp, userId, orgSlug, service name, operation type, success/failure status, and relevant metadata.

(c) Logs shall be retained for a minimum of one (1) year for operational data and three (3) years for security-relevant events.

(d) Logs shall not contain raw client data, API keys, passwords, or other sensitive values. Log sanitization shall be enforced at the observability plane level.

(e) Anomalous access patterns (e.g., access outside normal hours, bulk data downloads, cross-organization access attempts) shall trigger alerts to the Managing Member.

---

## 6. Privacy Compliance Framework

### 6.1 GDPR Compliance

For clients and data subjects located in the European Economic Area (EEA):

(a) **Lawful Basis:** Processing shall be conducted under a valid lawful basis, typically the performance of a contract (Article 6(1)(b)) or legitimate interests (Article 6(1)(f)).

(b) **Data Processing Agreements:** Where the Company acts as a Data Processor, a Data Processing Agreement (DPA) compliant with Article 28 of the GDPR shall be executed with the client (Data Controller).

(c) **Data Subject Rights:** The Company shall facilitate the exercise of data subject rights, including the right of access (Article 15), rectification (Article 16), erasure (Article 17), restriction (Article 18), data portability (Article 20), and objection (Article 21).

(d) **Data Protection Impact Assessments:** DPIAs shall be conducted for new processing activities that are likely to result in a high risk to the rights and freedoms of data subjects, including new AI model deployments and new client data processing workflows.

(e) **Data Transfers:** Transfers of personal data outside the EEA shall comply with Chapter V of the GDPR, using Standard Contractual Clauses (SCCs) or other approved transfer mechanisms.

(f) **Records of Processing:** The Company shall maintain records of processing activities as required by Article 30.

### 6.2 CCPA/CPRA Compliance

For California residents:

(a) The Company shall honor consumer rights under the CCPA/CPRA, including the right to know, right to delete, right to opt-out of sale/sharing, and right to non-discrimination.

(b) As a service provider, the Company shall process personal information only as directed by the client (business) and shall not sell or share personal information.

(c) Service provider agreements with California-based clients shall include CCPA-required contractual provisions.

### 6.3 Florida Information Protection Act

(a) The Company shall comply with FIPA requirements regarding the security of personal information of Florida residents.

(b) In the event of a data breach affecting Florida residents, the Company shall provide notice as required by Fla. Stat. Section 501.171, including notification to the Florida Department of Legal Affairs if more than 500 residents are affected.

### 6.4 Minnesota Data Practices

(a) To the extent applicable, the Company shall comply with the Minnesota Government Data Practices Act for any engagements involving Minnesota government entities.

---

## 7. Incident Response

### 7.1 Incident Classification

Security incidents shall be classified by severity:

**Critical (P1):** Confirmed data breach involving client data or PII; active unauthorized access to production systems; ransomware or destructive malware. Response time: Immediate.

**High (P2):** Suspected unauthorized access; security vulnerability actively being exploited; loss of system availability affecting client services. Response time: Within one (1) hour.

**Medium (P3):** Security vulnerability identified but not actively exploited; policy violation with potential security impact; anomalous access pattern detected. Response time: Within four (4) hours.

**Low (P4):** Minor policy violation; false positive security alert; informational security event. Response time: Within twenty-four (24) hours.

### 7.2 Incident Response Procedures

#### Phase 1: Detection and Identification
1. Any person who identifies or suspects a security incident shall immediately notify the Managing Member.
2. The Managing Member shall perform an initial assessment to classify the incident severity.
3. All actions taken shall be documented with timestamps.

#### Phase 2: Containment
1. **Immediate Containment (P1/P2):** Isolate affected systems from the network. Revoke compromised credentials immediately. Disable compromised accounts.
2. **Short-Term Containment:** Implement temporary fixes to prevent further damage while preserving evidence. Create forensic images of affected systems where applicable.
3. **Client Data Protection:** If client data may be affected, activate client-specific data protection measures, including isolation of the client's organizational data.

#### Phase 3: Eradication
1. Identify the root cause of the incident.
2. Remove the threat from all affected systems.
3. Patch vulnerabilities that were exploited.
4. Rotate all potentially compromised credentials, API keys, and tokens.

#### Phase 4: Recovery
1. Restore systems from known-good backups, following the Business Continuity Plan.
2. Verify system integrity before restoring service.
3. Implement enhanced monitoring for the recovery period.
4. Gradually restore services with increased logging and oversight.

#### Phase 5: Post-Incident Review
1. Conduct a post-incident review within five (5) business days of incident resolution.
2. Document lessons learned and update policies, procedures, and controls as warranted.
3. Prepare required breach notifications (see Section 7.3).
4. Update the incident log with final findings and remediation actions.

### 7.3 Breach Notification

(a) **Client Notification:** Affected clients shall be notified of any confirmed data breach involving their data within forty-eight (48) hours of confirmation. Notification shall include the nature of the breach, categories of data affected, measures taken, and recommended actions.

(b) **Regulatory Notification:**
  - GDPR: Supervisory authority notification within seventy-two (72) hours of becoming aware of the breach (Article 33). Data subjects shall be notified without undue delay if the breach is likely to result in a high risk (Article 34).
  - FIPA: Florida Attorney General notification within thirty (30) days if more than 500 Florida residents are affected.
  - CCPA: Notification in accordance with California Civil Code Section 1798.82.
  - Other jurisdictions: As required by applicable state and federal law.

(c) **Law Enforcement:** The Managing Member shall determine whether law enforcement notification is warranted based on the nature and severity of the incident.

---

## 8. Data Retention and Disposal

(a) Data shall be retained in accordance with the Company's File Retention Policy and applicable legal requirements.

(b) Client data shall be retained for the duration specified in the client engagement agreement, plus any additional period required by law.

(c) Upon expiration of the retention period, or upon client request (subject to legal hold requirements), data shall be securely destroyed:
  - Electronic data: Cryptographic erasure or multi-pass overwrite (NIST SP 800-88 guidelines)
  - Database records: Secure deletion with verification
  - Backups: Destruction or encryption key destruction for encrypted backups
  - Physical media: Physical destruction (shredding, degaussing)

(d) A certificate of destruction shall be available upon client request.

---

## 9. Third-Party Risk Management

(a) All third-party services processing Company or client data shall be assessed for security and privacy practices prior to engagement.

(b) Critical third-party services include:
  - **LLM Providers** (OpenAI, Anthropic, Google, Azure): Data processing terms shall be reviewed. Client data sent to LLM providers shall be minimized. Sovereign Mode shall be offered to clients with strict data residency requirements.
  - **Cloudflare:** DDoS protection and CDN. No client business data is stored by Cloudflare.
  - **GitHub:** Source code repository. No client data shall be committed to repositories.
  - **Tailscale:** Network mesh. Tailscale does not have access to the encrypted traffic content.

(c) Third-party service risk assessments shall be reviewed annually.

(d) Data Processing Agreements or equivalent contractual protections shall be in place with all third-party processors.

---

## 10. Training and Awareness

(a) All personnel shall complete security awareness training within seven (7) days of onboarding.

(b) Annual security refresher training shall be required for all personnel.

(c) Training shall cover: data classification, access control, incident reporting, social engineering awareness, client data handling, and platform-specific security practices.

(d) Training completion shall be documented and records retained for three (3) years.

---

## 11. Policy Enforcement

Violations of this Policy may result in disciplinary action up to and including termination of the contractor or intern engagement, as specified in the Acceptable Use Policy enforcement framework. Violations involving illegal activity may be referred to law enforcement. The Company reserves all rights to pursue civil remedies for damages resulting from policy violations.

---

## 12. Related Policies

- Acceptable Use Policy (OAI-OPS-001)
- Business Continuity Plan (OAI-OPS-003)
- Client Confidentiality Policy (OAI-ETH-001)
- File Retention Policy (OAI-OPS-007)
- Contractor Onboarding Policy (OAI-OPS-005)
- AI Ethics and Governance Policy (OAI-OPS-006)

---

## 13. Policy Review

This Policy shall be reviewed and updated at least annually, or upon the occurrence of a security incident, material change in operations, or change in applicable law. All personnel shall be notified of material changes and shall acknowledge the updated Policy within fourteen (14) days.

---

**Governing Law:** This Policy shall be interpreted in accordance with the laws of the State of Florida, with additional compliance requirements under Minnesota state law as applicable to Company operations.

**Orchestrator AI LLC**
A Florida Limited Liability Company
Operating in Minneapolis/St. Paul, Minnesota

*This policy is effective as of the date first written above and supersedes all prior data privacy and security policies of the Company.*

# Acceptable Use Policy

**Policy Number:** OAI-OPS-001
**Effective Date:** January 1, 2026
**Last Revised:** April 1, 2026
**Policy Owner:** Chief Technology Officer / Managing Member
**Approved By:** Managing Member, Orchestrator AI LLC

---

## 1. Purpose

This Acceptable Use Policy ("AUP") establishes the standards, guidelines, and restrictions governing the use of Orchestrator AI LLC's technology infrastructure, AI platform, software tools, and information systems. This policy is designed to protect the confidentiality, integrity, and availability of company and client data, ensure compliance with applicable laws and regulations, and maintain the trust of our clients in the legal, financial, and technology sectors.

Orchestrator AI LLC ("the Company") provides AI-powered orchestration tools, including the OrchestratorAI platform (orchestratorai.io), AI Coding Course materials, and Divinr.ai market prediction services. The sensitive nature of client data processed through these systems — including legal documents, financial predictions, and proprietary source code — demands rigorous acceptable use standards from all authorized users.

---

## 2. Scope

This policy applies to:

- **All personnel** of Orchestrator AI LLC, including the Managing Member, independent contractors (1099), interns, and any third-party consultants granted access to Company systems.
- **All technology resources** owned, leased, or operated by the Company, including but not limited to:
  - The OrchestratorAI platform and all associated microservices (Auth, Forge, Compose, Pulse, Bridge, Protocol Lab, Command, Admin, Assistant)
  - Local inference hardware (Apple Mac Studio, NVIDIA DGX Spark)
  - Supabase database instances (development and production)
  - Cloud services and SaaS accounts (Cloudflare, GitHub, Tailscale, LLM provider APIs)
  - Development tools, IDEs, CI/CD pipelines, and version control systems
  - Client-deployed OrchestratorAI instances on client hardware
  - Communication tools (email, Slack, video conferencing platforms)
- **All data** processed, stored, or transmitted through Company systems, including client data, proprietary code, model outputs, and business records.

This policy applies regardless of whether access occurs from Company-owned equipment, personal devices, or client-provided hardware, and regardless of physical location.

---

## 3. Definitions

**Authorized User:** Any individual who has been granted access to Company technology resources through the contractor onboarding process, including execution of appropriate agreements and security training.

**Client Data:** Any information, documents, files, communications, or data belonging to or relating to a client of the Company, including legal documents, financial records, proprietary code, and AI model outputs generated on behalf of a client.

**Company Systems:** All hardware, software, networks, databases, cloud services, and digital infrastructure owned, leased, or operated by Orchestrator AI LLC.

**Local Inference:** The execution of AI models on hardware physically located on Company or client premises, as distinguished from cloud-based API inference.

**API Keys:** Authentication credentials used to access third-party services, including LLM providers (OpenAI, Anthropic, Google, Azure), cloud infrastructure, and SaaS platforms.

**Sovereign Mode:** A deployment configuration in which all data processing occurs on local hardware without any data transmission to external cloud services.

**Platform Services:** The individual microservices comprising the OrchestratorAI platform, including Auth (authentication/authorization), Forge (complex agent workflows), Compose (simple agent composition), Pulse (internal automation), Bridge/Gatekeeper (external A2A communication), and associated web interfaces.

---

## 4. Policy Statements

### 4.1 General Principles

All Authorized Users shall:

(a) Use Company Systems solely for legitimate business purposes directly related to their assigned responsibilities and the Company's operations.

(b) Treat all client data with the highest degree of confidentiality, consistent with the Company's Client Confidentiality Policy and applicable legal and ethical obligations.

(c) Exercise reasonable care to protect the security and integrity of Company Systems and data.

(d) Comply with all applicable federal, state, and local laws, including but not limited to the Computer Fraud and Abuse Act (18 U.S.C. Section 1030), the Florida Information Protection Act (Fla. Stat. Section 501.171), the Minnesota Government Data Practices Act (Minn. Stat. Chapter 13), the General Data Protection Regulation (GDPR), and the California Consumer Privacy Act (CCPA).

(e) Report any suspected security incidents, policy violations, or unauthorized access immediately to the Managing Member.

### 4.2 OrchestratorAI Platform Use

#### 4.2.1 Authentication and Access Control

(a) All access to the OrchestratorAI platform must be authenticated through the Auth service (port 6100/7100). No platform service shall be accessed by bypassing the Auth service.

(b) Each Authorized User shall be assigned unique credentials. Sharing of credentials is strictly prohibited.

(c) Multi-factor authentication (MFA) shall be enabled for all accounts with access to production systems or client data.

(d) Access permissions shall follow the principle of least privilege. Users shall be granted only the minimum access necessary to perform their assigned duties.

(e) Contractor and intern access shall be provisioned through the standard onboarding process and revoked immediately upon termination of the engagement.

#### 4.2.2 Client Data Handling

(a) Client data shall be processed only through authorized OrchestratorAI platform services. Manual extraction, copying, or transfer of client data outside authorized channels is prohibited.

(b) Client data from different clients must remain isolated. Cross-client data access is prohibited unless explicitly authorized by both clients in writing.

(c) When using the Compose or Forge services for client work, the correct organizational slug (orgSlug) and execution context must be used to ensure proper data isolation and audit trails.

(d) Client data shall not be used for training AI models, benchmarking, or any purpose other than the specific services contracted by the client, unless the client has provided express written consent.

(e) All client data processing through the platform generates audit logs via the observability plane. These logs shall be retained in accordance with the File Retention Policy.

#### 4.2.3 Local Inference Machines

(a) The Company's local inference hardware (Mac Studio, NVIDIA DGX Spark) shall be used exclusively for authorized business purposes, including development, testing, client demonstrations, and production inference.

(b) Physical access to local inference hardware shall be restricted to authorized personnel. Hardware shall be stored in a secure location with appropriate environmental controls.

(c) Local inference machines shall maintain current operating system patches and security updates. Automated update schedules shall not be disabled without written approval from the Managing Member.

(d) No unauthorized software, models, or firmware shall be installed on local inference hardware. All software installations must be documented and approved.

(e) When local inference machines are used for client-specific Sovereign Mode deployments, the machine configuration must ensure complete data isolation from other client workloads.

#### 4.2.4 API Keys and Model Access

(a) API keys for LLM providers (OpenAI, Anthropic, Google Vertex AI, Azure OpenAI) and other third-party services shall be stored exclusively in environment variables or the Config Provider Service (packages/planes/config/). API keys shall never be committed to version control, embedded in source code, or transmitted via unencrypted channels.

(b) Each API key shall have a designated owner responsible for its security and rotation schedule.

(c) API keys shall be rotated at minimum every ninety (90) days, or immediately upon suspected compromise.

(d) Production API keys shall be distinct from development/testing keys. Development and testing shall use separate API accounts or rate-limited keys where available.

(e) API usage shall be monitored for anomalous patterns. Spending alerts shall be configured for all LLM provider accounts to prevent unauthorized usage and runaway costs.

(f) Client-specific API keys (where a client provides their own keys for local deployment) shall be stored in the client's isolated configuration and never accessed for Company purposes.

### 4.3 Prohibited Uses

The following activities are strictly prohibited:

#### 4.3.1 Data and Privacy Violations

(a) Accessing, viewing, or processing client data without a legitimate business need.

(b) Transferring client data to personal devices, personal cloud storage, or unauthorized third-party services.

(c) Using client data for personal projects, competitive intelligence, or any purpose outside the scope of the client engagement.

(d) Disabling, bypassing, or circumventing data isolation mechanisms, including organizational boundaries (orgSlug), database schema isolation, or network segmentation.

(e) Accessing production databases directly (Supabase on port 6010/6011 in development, 7010/7011 in production) except through authorized platform services or approved administrative procedures.

#### 4.3.2 Security Violations

(a) Sharing authentication credentials, API keys, SSH keys, or access tokens with any unauthorized person, including other Authorized Users who do not require such access.

(b) Attempting to access systems, services, or data for which the user has not been granted authorization.

(c) Installing, deploying, or executing unauthorized software, scripts, or AI models on Company Systems.

(d) Disabling or circumventing security controls, including firewalls, intrusion detection systems, encryption, or access control mechanisms.

(e) Using Company Systems to conduct security testing, penetration testing, or vulnerability scanning against any system (internal or external) without prior written authorization from the Managing Member.

(f) Connecting unauthorized devices to the Company's Tailscale network or any internal network segment.

#### 4.3.3 Platform Misuse

(a) Using the OrchestratorAI platform, Forge workflows, or Compose agents for any illegal purpose, including but not limited to generating content that violates intellectual property rights, facilitates fraud, or constitutes unauthorized practice of law.

(b) Using Divinr.ai market prediction outputs as a basis for providing investment advice to clients or third parties. All Divinr.ai outputs must include appropriate disclaimers as specified in the AI Ethics and Governance Policy.

(c) Modifying, reverse-engineering, or attempting to extract proprietary information from AI models accessed through the platform, except as required for authorized development work.

(d) Using Company Systems for cryptocurrency mining, personal AI projects, or computationally intensive tasks unrelated to Company business.

(e) Exceeding authorized API usage limits or intentionally generating excessive API calls that result in unnecessary costs.

(f) Bypassing the Bridge/Gatekeeper service for external agent-to-agent communications. All external communications must pass through the Gatekeeper for security inspection.

#### 4.3.4 Communications Violations

(a) Using Company Systems to send unsolicited commercial communications (spam), harassing messages, or threatening communications.

(b) Impersonating another person, client, or entity when using Company Systems.

(c) Posting proprietary Company information, client data, or confidential business information on public forums, social media, or open-source repositories without authorization.

### 4.4 Development and Testing

(a) Development work shall be conducted in designated development environments. Production data shall not be used in development or testing without explicit anonymization/sanitization and Managing Member approval.

(b) All code changes shall follow the Company's established version control practices, including branch-based development, code review, and CI/CD pipeline validation.

(c) Test data shall be synthetic or properly anonymized. Under no circumstances shall real client data be committed to version control repositories.

(d) Development API keys and credentials shall be stored in local .env files that are excluded from version control via .gitignore. The .env.example file shall contain only placeholder values.

(e) When testing platform services locally, developers shall use the designated development ports (6xxx series) and shall not interfere with production services (7xxx series) without authorization.

### 4.5 Third-Party Services and Integrations

(a) The use of third-party services, SaaS platforms, or cloud providers for Company business must be approved by the Managing Member prior to adoption.

(b) Data shared with approved third-party services shall be limited to the minimum necessary for the intended purpose.

(c) Authorized Users shall comply with the terms of service of all third-party platforms used in connection with Company business.

(d) Integration of new external services with the OrchestratorAI platform must be routed through the Bridge/Gatekeeper service and approved through the standard change management process.

---

## 5. Procedures

### 5.1 Access Provisioning

1. New Authorized Users shall complete the Contractor Onboarding process, including execution of the Independent Contractor Agreement, IP Assignment, and NDA.
2. The Managing Member or designated administrator shall provision platform access through the Admin service, assigning appropriate roles and organizational access.
3. API keys and credentials shall be provisioned through secure channels (encrypted communication or in-person). Keys shall never be transmitted via unencrypted email or messaging.
4. The new user shall complete the Company's security awareness orientation before being granted access to any system containing client data.

### 5.2 Access Review

1. Access permissions shall be reviewed quarterly by the Managing Member.
2. Inactive accounts (no login for 60 days) shall be flagged for review and may be suspended.
3. Access shall be modified or revoked within one (1) business day when a contractor's role changes or engagement terminates.

### 5.3 Incident Reporting

1. Any suspected violation of this AUP shall be reported immediately to the Managing Member via direct communication (phone, secure message, or in-person).
2. The reporter shall document the suspected violation, including the date, time, systems involved, and nature of the suspected violation.
3. The Managing Member shall initiate an investigation within twenty-four (24) hours of receiving a report.
4. Investigation findings and remediation actions shall be documented and retained for a minimum of three (3) years.

### 5.4 Security Incident Response

1. Upon discovery of a potential security incident (unauthorized access, data breach, or system compromise), the discovering party shall immediately notify the Managing Member.
2. The Managing Member shall assess the scope and severity of the incident and initiate the Incident Response procedures defined in the Data Privacy and Security Policy.
3. Affected API keys shall be rotated immediately.
4. Affected client accounts shall be reviewed and clients notified as required by applicable law and contractual obligations.

---

## 6. Monitoring and Enforcement

### 6.1 Monitoring

The Company reserves the right to monitor all use of Company Systems, including but not limited to:

(a) Platform access logs and audit trails generated by the observability plane.

(b) API usage patterns and costs.

(c) Database access logs.

(d) Network traffic through the Tailscale mesh and Cloudflare gateway.

(e) Version control activity (commits, pull requests, branch operations).

All monitoring shall be conducted in accordance with applicable laws and the Company's Data Privacy and Security Policy. Authorized Users acknowledge and consent to such monitoring as a condition of access to Company Systems.

### 6.2 Enforcement

Violations of this Acceptable Use Policy may result in the following actions, depending on the severity and nature of the violation:

**Level 1 — Minor Violations** (e.g., inadvertent policy deviation, first offense for non-critical violations):
- Verbal or written warning
- Mandatory re-completion of security awareness training
- Documented corrective action plan

**Level 2 — Significant Violations** (e.g., negligent handling of client data, unauthorized access attempts, repeated minor violations):
- Written warning with formal documentation
- Temporary suspension of access to affected systems
- Enhanced monitoring of the individual's system activity
- Potential modification of access permissions

**Level 3 — Severe Violations** (e.g., intentional data exfiltration, deliberate circumvention of security controls, illegal activity):
- Immediate suspension of all system access
- Termination of contractor agreement or internship
- Referral to appropriate law enforcement authorities
- Civil legal action as appropriate to protect Company and client interests

The Managing Member retains sole discretion in determining the severity classification of any violation and the appropriate response. Nothing in this enforcement framework limits the Company's right to take any action permitted by law or contract in response to a policy violation.

---

## 7. Exceptions

Exceptions to this policy may be granted only by the Managing Member in writing. Exception requests must include:

(a) The specific policy provision for which an exception is sought.

(b) The business justification for the exception.

(c) The proposed alternative controls or safeguards.

(d) The requested duration of the exception.

All approved exceptions shall be documented, time-limited, and reviewed at each quarterly access review.

---

## 8. Related Policies

- Data Privacy and Security Policy (OAI-OPS-002)
- Client Confidentiality Policy (OAI-ETH-001)
- Contractor Onboarding Policy (OAI-OPS-005)
- AI Ethics and Governance Policy (OAI-OPS-006)
- Social Media and Public Communications Policy (OAI-ETH-003)
- Remote Work Policy (OAI-OPS-004)

---

## 9. Policy Review

This policy shall be reviewed and updated at least annually, or more frequently as necessitated by changes in technology, business operations, legal requirements, or the threat landscape. All Authorized Users shall be notified of material changes and shall acknowledge the updated policy within fourteen (14) days of notification.

---

## 10. Acknowledgment

All Authorized Users are required to read, understand, and acknowledge this Acceptable Use Policy prior to being granted access to Company Systems, and annually thereafter. Acknowledgment shall be documented and retained by the Company.

---

**Governing Law:** This policy shall be interpreted and enforced in accordance with the laws of the State of Florida, with operational compliance additionally governed by the laws of the State of Minnesota where applicable.

**Orchestrator AI LLC**
A Florida Limited Liability Company
Operating in Minneapolis/St. Paul, Minnesota

*This policy is effective as of the date first written above and supersedes all prior acceptable use policies of the Company.*

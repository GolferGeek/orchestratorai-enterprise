---
**Document ID:** CANON-002
**Version:** 1.0
**Effective Date:** January 15, 2026
**Classification:** Internal — Restricted
**Owner:** Chief Information Security Officer (CISO)
**Approved By:** Board of Directors, OrchestratorAI LLC
**Review Cycle:** Annual
---

# Orchestrator AI Acceptable Use and Security Standards

## Purpose and Scope

This Acceptable Use and Security Standards document ("Standards") establishes the rules, responsibilities, and security requirements governing the use of OrchestratorAI LLC ("Company") information systems, AI platforms, and technology resources. These Standards apply to all employees, contractors, temporary workers, and third-party agents who access Company systems or process Company data.

These Standards are supplemental to and should be read in conjunction with the Data Classification Policy [CANON-001], the Incident Response Procedures [CANON-003], and all applicable employment agreements.

---

## Article I — General Acceptable Use

### Section 1.1 — Authorized Use

Company information systems, including but not limited to computing hardware, software, networks, AI inference platforms, communication tools, and cloud services, are provided primarily for authorized business purposes. Limited personal use is permitted provided it does not interfere with job responsibilities, consume excessive resources, or violate any provision of these Standards.

### Section 1.2 — Prohibited Activities

The following activities are expressly prohibited on Company systems:

(a) Unauthorized access to, or attempted access to, systems, data, or accounts for which the user has not been granted explicit permission;

(b) Installation of unauthorized software, browser extensions, AI model plugins, or hardware devices on Company-managed endpoints;

(c) Circumvention or disabling of security controls, including but not limited to firewalls, intrusion detection systems, endpoint protection agents, data loss prevention tools, and authentication mechanisms;

(d) Use of Company systems for illegal activities, harassment, discrimination, or any activity that violates Company policies or applicable law;

(e) Transmission of malicious code, including viruses, worms, ransomware, trojans, or any software designed to disrupt, damage, or gain unauthorized access to systems;

(f) Unauthorized disclosure, copying, or transfer of Company information classified as Tier 3 (Confidential) or Tier 4 (Restricted) under the Data Classification Policy [CANON-001];

(g) Use of Company AI platforms or model inference services for purposes unrelated to authorized business activities, including personal projects, competitive analysis for third parties, or generation of content that violates applicable law or Company values.

### Section 1.3 — Monitoring and Privacy

The Company reserves the right to monitor, log, audit, and inspect all activity on Company information systems without prior notice, to the extent permitted by applicable law. Users should have no expectation of privacy when using Company systems. Monitoring activities are conducted to protect Company assets, ensure compliance, and support incident investigation.

---

## Article II — AI Model Usage Restrictions

### Section 2.1 — Approved Model Providers

All AI model inference within Company systems shall be routed through the Company's centralized LLM Service plane. Direct API calls to model providers outside the LLM Service plane are prohibited. The following model providers are currently approved for production use:

(a) Anthropic (Claude model family) — approved for all classification tiers when accessed via the LLM Service plane;
(b) OpenAI (GPT model family) — approved for Tier 1 through Tier 3 data;
(c) Google (Gemini model family) — approved for Tier 1 through Tier 3 data;
(d) Azure AI (hosted models) — approved for all classification tiers when deployed in Company-managed Azure tenants.

### Section 2.2 — Model Usage Boundaries

Users of Company AI platforms shall observe the following boundaries:

(a) No Tier 4 (Restricted) data shall be submitted to any third-party model provider unless that provider operates under a Data Processing Agreement (DPA) that meets or exceeds the protections specified in the Data Classification Policy [CANON-001];

(b) Users shall not attempt to extract, reconstruct, or reverse-engineer model weights, training data, or internal representations from any AI model accessed through Company systems;

(c) AI-generated outputs shall not be treated as authoritative without human review for decisions affecting legal rights, financial obligations, employment status, or safety-critical operations;

(d) Users shall not use AI models to generate content that impersonates real individuals, creates synthetic media for deceptive purposes, or produces content designed to manipulate or deceive.

### Section 2.3 — Prompt Injection and Adversarial Use

Users shall not attempt to bypass model safety controls, inject adversarial prompts, or manipulate AI systems to produce outputs that violate these Standards or applicable law. Discovery of prompt injection vulnerabilities shall be reported immediately to the Security team through the vulnerability disclosure process defined in the Incident Response Procedures [CANON-003].

---

## Article III — Security Standards

### Section 3.1 — Authentication Requirements

#### Section 3.1.1 — Password Policy

All user accounts shall be protected by passwords meeting the following minimum requirements: (a) minimum length of 14 characters; (b) inclusion of uppercase letters, lowercase letters, numbers, and special characters; (c) no reuse of the previous 12 passwords; (d) maximum age of 90 days for standard accounts and 60 days for privileged accounts.

#### Section 3.1.2 — Multi-Factor Authentication

Multi-factor authentication (MFA) is mandatory for all access to Company systems, with the following specifications: (a) phishing-resistant MFA (FIDO2/WebAuthn) is required for Tier 4 system access; (b) time-based one-time password (TOTP) or push notification-based MFA is the minimum for all other system access; (c) SMS-based MFA is not permitted as a sole second factor.

### Section 3.2 — Endpoint Security

All devices used to access Company systems shall comply with the following endpoint security requirements: (a) Company-managed endpoint detection and response (EDR) agent installed and active; (b) operating system and all software maintained at vendor-supported versions with security patches applied within 14 days of release for critical vulnerabilities and 30 days for all others; (c) full-disk encryption enabled; (d) automatic screen lock after 5 minutes of inactivity; (e) local firewall enabled and configured per Company security baseline.

### Section 3.3 — Network Security

#### Section 3.3.1 — Remote Access

Remote access to Company systems shall be conducted exclusively through Company-approved VPN or zero-trust network access (ZTNA) solutions. Direct exposure of internal services to the public internet is prohibited unless explicitly authorized by the CISO and protected by the Company's API gateway.

#### Section 3.3.2 — Wireless Networks

Connection to Company systems over public wireless networks is permitted only when using the Company VPN. Use of personal hotspots is permitted under the same VPN requirement. Users shall not connect Company devices to unknown or untrusted wireless networks without VPN protection.

### Section 3.4 — Data Protection

#### Section 3.4.1 — Data Loss Prevention

The Company employs data loss prevention (DLP) controls to detect and prevent unauthorized transmission of classified information. Users shall not attempt to circumvent DLP controls. Legitimate business needs that conflict with DLP rules shall be addressed through the Policy Exception process defined in the Data Classification Policy [CANON-001], Section 5.4.

#### Section 3.4.2 — Removable Media

Use of removable storage media (USB drives, external hard drives, SD cards) with Company systems requires prior written approval from the user's manager and the IT Security team. Approved removable media must be encrypted and tracked in the Company's asset management system.

---

## Article IV — Indemnification and Liability

### Section 4.1 — Indemnification Obligations

Each user of Company information systems agrees to indemnify, defend, and hold harmless OrchestratorAI LLC, its officers, directors, employees, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to the user's violation of these Standards. This obligation of holding harmless extends to any third-party claims resulting from the user's unauthorized or improper use of Company systems.

### Section 4.2 — Limitation of Liability

To the maximum extent permitted by applicable law, the Company shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from the use of or inability to use Company information systems, including but not limited to loss of data, loss of profits, or business interruption, regardless of the theory of liability.

### Section 4.3 — Liquidated Damages

In the event of a willful and material breach of these Standards that results in unauthorized disclosure of Tier 4 (Restricted) data, the breaching party agrees to pay liquidated damages in the amount of fifty thousand dollars ($50,000) per incident, which the parties agree represents a reasonable estimate of the damages that would be difficult to calculate precisely. These predetermined monetary penalties are not intended as a penalty but as a genuine pre-estimate of loss.

---

## Article V — Force Majeure and Extraordinary Circumstances

### Section 5.1 — Force Majeure Events

Neither the Company nor any user shall be liable for failure to perform obligations under these Standards to the extent that such failure is caused by events constituting force majeure, including but not limited to: acts of God, natural disasters, earthquakes, floods, hurricanes, pandemics, epidemics, war, terrorism, civil unrest, government actions, embargoes, sanctions, cyber warfare by nation-state actors, and widespread infrastructure failures beyond the reasonable control of the affected party.

### Section 5.2 — Notification Requirements

A party claiming relief under the force majeure provision shall notify the other party in writing within seventy-two (72) hours of becoming aware of the event. The notification shall describe the nature of the event, its expected duration, and the steps being taken to mitigate its impact. These extraordinary unforeseeable circumstances must be documented in detail.

### Section 5.3 — Continuity Obligations

Force majeure relief does not suspend the obligation to protect classified information. Even during acts of God or other extraordinary events, Tier 4 data protection requirements remain in effect to the maximum extent feasible. The Business Continuity Plan [CANON-004] provides specific procedures for maintaining data protection during disruptions.

---

## Article VI — Severability and General Provisions

### Section 6.1 — Severability

If any provision of these Standards is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, such partial invalidity, illegality, or unenforceability shall not affect any other provision. The remaining provisions shall continue in full force and effect, and the invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving the original intent. This separability principle ensures that no single defective clause can undermine the entire Standards.

### Section 6.2 — Waiver

The failure of the Company to enforce any provision of these Standards shall not constitute a waiver of the Company's right to enforce that provision or any other provision in the future. Any waiver of rights must be made in writing and signed by an authorized representative of the Company. No relinquishment of rights shall be implied from any course of dealing or delay in enforcement. The non-exercise of any right herein shall not operate as a forfeiture of that right.

### Section 6.3 — Entire Agreement

These Standards, together with the Data Classification Policy [CANON-001], the Incident Response Procedures [CANON-003], the Business Continuity Plan [CANON-004], and any applicable employment or contractor agreements, constitute the complete understanding between the Company and its users regarding the acceptable use of Company information systems and security requirements.

### Section 6.4 — Governing Law

These Standards shall be governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict of laws principles. Any dispute arising under these Standards shall be resolved in the state or federal courts located in Hennepin County, Minnesota.

---

## Article VII — Compliance Verification

### Section 7.1 — Self-Assessment

Each user is responsible for understanding and complying with these Standards. Department managers shall conduct annual self-assessments of their teams' compliance and report findings to the CISO.

### Section 7.2 — Audits

The Company's internal audit function, or its designated external auditor, may conduct periodic audits of compliance with these Standards. All users shall cooperate fully with audit activities, including providing access to systems, records, and information as requested.

### Section 7.3 — Reporting Violations

Users who become aware of actual or suspected violations of these Standards shall report them promptly through one of the following channels: (a) direct report to the user's manager; (b) report to the IT Security team; (c) report through the Company's anonymous ethics hotline. The Company prohibits retaliation against any individual who reports a violation in good faith.

### Section 7.4 — Consequences of Non-Compliance

Violations of these Standards may result in: (a) mandatory remedial training; (b) temporary or permanent restriction of system access; (c) disciplinary action up to and including termination; (d) civil liability including the liquidated damages provisions of Article IV; and (e) referral to law enforcement where criminal activity is suspected.

---

## Article VIII — Review and Amendment

### Section 8.1 — Review Schedule

These Standards shall be reviewed at least annually by the CISO, with input from Legal, Human Resources, and Engineering leadership. Ad hoc reviews may be triggered by significant security incidents, regulatory changes, or material changes to the Company's technology environment.

### Section 8.2 — Amendment Authority

Amendments to Articles I through III and Articles VII through VIII may be made by the CISO with notification to the Board of Directors. Amendments to Articles IV through VI require review by Legal counsel and approval by the Board of Directors.

### Section 8.3 — Version History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | January 15, 2026 | CISO | Initial release |

---

*Adopted by the Board of Directors of OrchestratorAI LLC on January 15, 2026.*
*This document supplements the Data Classification Policy [CANON-001] and shall be read in conjunction with all related Company policies.*

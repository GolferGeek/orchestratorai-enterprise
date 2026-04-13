---
**Document ID:** HIPAA-SR-ADMIN
**Framework:** HIPAA (Health Insurance Portability and Accountability Act)
**Version:** 1.0
**Effective Date:** April 14, 2003 (Privacy Rule) / February 17, 2010 (HITECH amendments)
**Classification:** Regulatory Framework — Public
**Owner:** U.S. Department of Health and Human Services (HHS)
**Review Cycle:** Per regulatory amendment
**Related Documents:** [HIPAA-SR-PHYSICAL], [HIPAA-SR-TECHNICAL], [HIPAA-SR-ORG], [HIPAA-PR-ADMIN], [HIPAA-ENF-PENALTIES]
---

# Security Rule — Administrative Safeguards

## Regulatory Basis
45 CFR 164.308 establishes administrative safeguards that covered entities and business associates must implement to protect electronic protected health information (ePHI). Administrative safeguards account for over half of the Security Rule requirements and address the selection and execution of security measures and workforce conduct.

## Required vs. Addressable Specifications
The Security Rule distinguishes between **required (R)** and **addressable (A)** implementation specifications. "Addressable" does NOT mean optional. An entity must assess whether the specification is reasonable and appropriate. If so, implement it. If not, document why and implement an equivalent alternative measure (or document why the standard is not applicable).

## Standard 1: Security Management Process — 45 CFR 164.308(a)(1)

### Risk Analysis (R)
Conduct an accurate and thorough assessment of the potential risks and vulnerabilities to the confidentiality, integrity, and availability of ePHI held by the covered entity or business associate.
- Must be organization-wide, covering all ePHI regardless of electronic medium or location.
- Must identify all systems that create, receive, maintain, or transmit ePHI.
- Must identify and document reasonably anticipated threats and vulnerabilities.
- Must assess current security measures.
- Must determine the likelihood and impact of potential threats.
- Risk analysis must be updated periodically (no specified frequency, but must reflect changes to environment).

### Risk Management (R)
Implement security measures sufficient to reduce risks and vulnerabilities to a reasonable and appropriate level based on the risk analysis.
- Must address all risks identified in the risk analysis.
- Must be documented and tracked.
- Must prioritize based on risk level.

### Sanction Policy (R)
Apply appropriate sanctions against workforce members who fail to comply with the entity's security policies and procedures.
- Must be applied consistently.
- Coordinate with Privacy Rule sanction requirements per [HIPAA-PR-ADMIN].

### Information System Activity Review (R)
Implement procedures to regularly review records of information system activity, such as audit logs, access reports, and security incident tracking reports.
- Review frequency should be risk-based.
- Must cover all systems containing ePHI.
- Coordinate with audit controls under [HIPAA-SR-TECHNICAL].

## Standard 2: Assigned Security Responsibility — 45 CFR 164.308(a)(2)

### Security Officer Designation (R)
Identify the security official responsible for the development and implementation of the entity's security policies and procedures.
- May be the same person as the Privacy Officer per [HIPAA-PR-ADMIN], but the roles are distinct.
- The security official must have sufficient authority and organizational support.
- Must be documented.

## Standard 3: Workforce Security — 45 CFR 164.308(a)(3)

### Authorization and/or Supervision (A)
Implement procedures for the authorization and/or supervision of workforce members who work with ePHI or in locations where it might be accessed.

### Workforce Clearance Procedure (A)
Implement procedures to determine that the access of a workforce member to ePHI is appropriate.
- Should include background checks where appropriate.
- Clearance level should be based on job function and access needs.

### Termination Procedures (A)
Implement procedures for terminating access to ePHI when the employment of, or other arrangement with, a workforce member ends, or when access is no longer necessary.
- Must include recovery of keys, tokens, access cards.
- Must include deactivation of accounts.
- Should include procedures for changes in job function (not only termination).

## Standard 4: Information Access Management — 45 CFR 164.308(a)(4)

### Isolating Health Care Clearinghouse Functions (R)
If a health care clearinghouse is part of a larger organization, the clearinghouse must implement policies and procedures that protect ePHI from unauthorized access by the larger organization.

### Access Authorization (A)
Implement policies and procedures for granting access to ePHI — for example, through access to a workstation, transaction, program, process, or other mechanism.
- Must be based on job function and minimum necessary principles.

### Access Establishment and Modification (A)
Implement policies and procedures that, based upon the entity's access authorization policies, establish, document, review, and modify a user's right of access to a workstation, transaction, program, or process.

## Standard 5: Security Awareness and Training — 45 CFR 164.308(a)(5)

### Security Reminders (A)
Periodic security updates — may include newsletters, emails, posters, staff meetings, or focused training sessions.

### Protection from Malicious Software (A)
Procedures for guarding against, detecting, and reporting malicious software.
- Must include anti-malware solutions, user awareness, and reporting procedures.

### Log-in Monitoring (A)
Procedures for monitoring log-in attempts and reporting discrepancies.
- Should include lockout policies and failed login alerting.

### Password Management (A)
Procedures for creating, changing, and safeguarding passwords.
- Should address complexity requirements, expiration, and prohibition on sharing.

## Standard 6: Security Incident Procedures — 45 CFR 164.308(a)(6)

### Response and Reporting (R)
Identify and respond to suspected or known security incidents; mitigate, to the extent practicable, harmful effects of security incidents that are known to the covered entity or business associate; and document security incidents and their outcomes.
- A "security incident" is the attempted or successful unauthorized access, use, disclosure, modification, or destruction of information or interference with system operations in an information system.
- Must coordinate with breach notification requirements under [HIPAA-BN-REQ].

## Standard 7: Contingency Plan — 45 CFR 164.308(a)(7)

### Data Backup Plan (R)
Establish and implement procedures to create and maintain retrievable exact copies of ePHI.
- Backup frequency should be risk-based.
- Must test backup and recovery procedures.

### Disaster Recovery Plan (R)
Establish and implement procedures to restore any loss of data.
- Must address recovery time objectives (RTOs) and recovery point objectives (RPOs).
- Must include step-by-step restoration procedures.

### Emergency Mode Operation Plan (R)
Establish and implement procedures to enable continuation of critical business processes for protection of the security of ePHI while operating in emergency mode.

### Testing and Revision Procedures (A)
Implement procedures for periodic testing and revision of contingency plans.
- Should include tabletop exercises, functional testing, and full-scale testing.

### Applications and Data Criticality Analysis (A)
Assess the relative criticality of specific applications and data in support of other contingency plan components.

## Standard 8: Evaluation — 45 CFR 164.308(a)(8)

### Evaluation (R)
Perform a periodic technical and nontechnical evaluation, based initially upon the standards implemented under the Security Rule and subsequently in response to environmental or operational changes affecting the security of ePHI, that establishes the extent to which the entity's security policies and procedures meet the requirements of the Security Rule.

## Standard 9: Business Associate Contracts — 45 CFR 164.308(b)

### Written Contract or Other Arrangement (R)
A covered entity may permit a business associate to create, receive, maintain, or transmit ePHI on its behalf only if the covered entity obtains satisfactory assurances (in the form of a BAA) that the business associate will appropriately safeguard the information. See [HIPAA-SR-ORG] for detailed BAA requirements.

## Implementation Checklist
- [ ] Conduct comprehensive risk analysis covering all ePHI systems
- [ ] Develop and implement risk management plan addressing identified risks
- [ ] Document and publish sanction policy for security violations
- [ ] Implement information system activity review procedures and schedules
- [ ] Designate Security Officer with documented authority
- [ ] Implement workforce authorization and supervision procedures
- [ ] Establish clearance procedures for ePHI access
- [ ] Create termination and role-change access procedures
- [ ] Implement role-based access authorization policies
- [ ] Deploy security awareness training program (reminders, malware, login monitoring, passwords)
- [ ] Establish incident response and reporting procedures linked to [HIPAA-BN-REQ]
- [ ] Create and test data backup plan with defined frequency
- [ ] Develop disaster recovery plan with RTOs and RPOs
- [ ] Document emergency mode operation procedures
- [ ] Schedule periodic Security Rule evaluation
- [ ] Execute BAAs with all business associates per [HIPAA-SR-ORG]

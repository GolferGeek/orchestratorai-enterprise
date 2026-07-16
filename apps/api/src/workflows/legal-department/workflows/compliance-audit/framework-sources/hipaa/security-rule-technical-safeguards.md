---
**Document ID:** HIPAA-SR-TECHNICAL
**Framework:** HIPAA (Health Insurance Portability and Accountability Act)
**Version:** 1.0
**Effective Date:** April 14, 2003 (Privacy Rule) / February 17, 2010 (HITECH amendments)
**Classification:** Regulatory Framework — Public
**Owner:** U.S. Department of Health and Human Services (HHS)
**Review Cycle:** Per regulatory amendment
**Related Documents:** [HIPAA-SR-ADMIN], [HIPAA-SR-PHYSICAL], [HIPAA-SR-ORG], [HIPAA-BN-UNSECURED], [HIPAA-ENF-PENALTIES]
---

# Security Rule — Technical Safeguards

## Regulatory Basis
45 CFR 164.312 establishes the technical safeguards that covered entities and business associates must implement to protect ePHI. Technical safeguards are the technology and the policies and procedures for its use that protect ePHI and control access to it.

## Required vs. Addressable Specifications
Each implementation specification is designated as **required (R)** or **addressable (A)**. Addressable means the entity must assess reasonableness and appropriateness — it does NOT mean optional. If not implemented, the entity must document the rationale and any equivalent alternative measure.

## Standard 1: Access Control — 45 CFR 164.312(a)(1)
Implement technical policies and procedures for electronic information systems that maintain ePHI to allow access only to those persons or software programs that have been granted access rights as specified in [HIPAA-SR-ADMIN] Standard 4 (Information Access Management).

### Unique User Identification (R)
Assign a unique name and/or number for identifying and tracking user identity.
- Every user accessing ePHI must have a unique identifier — no shared accounts for ePHI access.
- User IDs must be traceable to a specific individual for audit and accountability purposes.
- Service accounts and system-to-system connections must also have unique identifiers.
- User IDs should never be re-assigned to different individuals.
- Must integrate with audit controls (Standard 2) to create a complete audit trail.

### Emergency Access Procedure (R)
Establish and implement procedures for obtaining necessary ePHI during an emergency.
- Must define what constitutes an emergency warranting elevated access.
- Must designate who may authorize emergency access.
- Must specify how emergency access is technically granted (break-glass procedures).
- All emergency access events must be logged and reviewed post-incident.
- Must coordinate with contingency plan per [HIPAA-SR-ADMIN] Standard 7.

### Automatic Logoff (A)
Implement electronic procedures that terminate an electronic session after a predetermined time of inactivity.
- Should define timeout thresholds appropriate to the risk level (e.g., 15 minutes for clinical workstations, shorter for public-area terminals).
- Must apply to all systems accessing ePHI (applications, operating systems, VPN connections).
- Consideration: timeout should not disrupt clinical workflows to an extent that encourages workarounds (e.g., propping sessions open).
- If determined not reasonable/appropriate, document rationale and any alternative measures.

### Encryption and Decryption (A)
Implement a mechanism to encrypt and decrypt ePHI.
- This specification addresses encryption at rest (data stored on servers, databases, devices, media).
- While addressable, encryption at rest is strongly recommended and is the primary method for rendering ePHI "unusable, unreadable, or indecipherable" to unauthorized individuals per [HIPAA-BN-UNSECURED].
- If encryption at rest is implemented using NIST-recommended standards, a loss of the encrypted device does not constitute a breach requiring notification — this is the safe harbor provision.
- Recommended standards: AES-128 or AES-256 per NIST SP 800-111 (Guide to Storage Encryption Technologies).
- Key management must follow NIST SP 800-57 (Recommendation for Key Management).
- If not implemented, the entity must document why and describe alternative safeguards (e.g., physical access controls, device destruction policies).

## Standard 2: Audit Controls — 45 CFR 164.312(b)

### Audit Controls (R)
Implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use ePHI.
- Must capture who accessed what ePHI, when, and what action was taken (read, create, modify, delete).
- Audit logs must be tamper-resistant and protected from unauthorized modification or deletion.
- Must define log retention period (no minimum specified in HIPAA, but must support the 6-year documentation requirement per [HIPAA-PR-ADMIN] and be sufficient for security incident investigation).
- Must implement regular review of audit logs per [HIPAA-SR-ADMIN] Standard 1 (Information System Activity Review).
- Must include: user authentication events (successful and failed), system events, application-level access to ePHI, administrative actions, and security-relevant configuration changes.
- Should integrate with security incident procedures per [HIPAA-SR-ADMIN] Standard 6.

## Standard 3: Integrity — 45 CFR 164.312(c)(1)
Implement policies and procedures to protect ePHI from improper alteration or destruction.

### Mechanism to Authenticate Electronic Protected Health Information (A)
Implement electronic mechanisms to corroborate that ePHI has not been altered or destroyed in an unauthorized manner.
- Methods include checksums, hash functions (SHA-256 or stronger), digital signatures, and message authentication codes.
- Must apply to ePHI in transit and at rest where integrity risks are identified in the risk analysis per [HIPAA-SR-ADMIN].
- Must detect unauthorized modification and trigger alerts for investigation.
- Database integrity controls (referential integrity, transaction logging, write-ahead logs) support this specification.
- Backup verification procedures should validate data integrity per [HIPAA-SR-ADMIN] Standard 7.

## Standard 4: Person or Entity Authentication — 45 CFR 164.312(d)

### Person or Entity Authentication (R)
Implement procedures to verify that a person or entity seeking access to ePHI is the one claimed.
- Authentication must precede any access to ePHI.
- Acceptable authentication factors include:
  - **Something you know** — password, PIN, security questions
  - **Something you have** — token, smart card, mobile device
  - **Something you are** — biometric (fingerprint, facial recognition, iris scan)
- Multi-factor authentication (MFA) is not explicitly required but is strongly recommended by HHS and is considered an industry best practice, particularly for remote access.
- Must address authentication for:
  - Workforce members accessing ePHI
  - Business associates and their workforce
  - System-to-system authentication (API keys, certificates, mutual TLS)
  - Patient portal access (if applicable)
- Failed authentication attempts must be logged per Standard 2 (Audit Controls).

## Standard 5: Transmission Security — 45 CFR 164.312(e)(1)
Implement technical security measures to guard against unauthorized access to ePHI that is being transmitted over an electronic communications network.

### Integrity Controls (A)
Implement security measures to ensure that electronically transmitted ePHI is not improperly modified without detection until disposed of.
- Methods include TLS/SSL with integrity verification, VPN tunnels, message authentication codes, and digital signatures.
- Must assess transmission integrity risks in the risk analysis per [HIPAA-SR-ADMIN].
- Must apply to all transmission methods: internal network, internet, email, file transfer, API calls, messaging.

### Encryption (A)
Implement a mechanism to encrypt ePHI whenever deemed appropriate.
- While addressable, encryption in transit is strongly recommended and is the industry standard.
- Minimum recommended: TLS 1.2 or higher for all transmissions containing ePHI.
- For email: S/MIME, PGP, or TLS-enforced SMTP connections.
- For APIs and web services: HTTPS with valid certificates.
- For file transfers: SFTP, FTPS, or SCP.
- Unencrypted transmission of ePHI over the public internet is a significant risk that is difficult to justify as reasonable.
- Encryption in transit, when meeting NIST standards, contributes to the safe harbor for breach notification under [HIPAA-BN-UNSECURED].
- Key exchange protocols should follow NIST SP 800-56A/B.

## Technical Safeguards in Modern Environments

### Cloud Computing
- Cloud environments must implement all technical safeguards.
- Shared responsibility model: CSP provides infrastructure-level controls; the covered entity retains responsibility for application-level access controls, encryption key management, and audit log review.
- BAA with CSP must address technical safeguard responsibilities per [HIPAA-SR-ORG].

### Mobile and Remote Access
- Mobile devices accessing ePHI must implement encryption at rest (device encryption) and in transit.
- Mobile device management (MDM) solutions support auto-logoff, encryption enforcement, and remote wipe capabilities.
- VPN or zero-trust network access should be implemented for remote connections to ePHI systems.

### APIs and Interoperability
- FHIR-based APIs must implement OAuth 2.0 or equivalent for authentication and authorization.
- API access to ePHI must generate audit logs meeting Standard 2 requirements.
- Rate limiting and anomaly detection support access control objectives.

## Implementation Checklist
- [ ] Implement unique user identification for all ePHI systems — no shared accounts
- [ ] Establish emergency access (break-glass) procedures with logging
- [ ] Configure automatic session timeout on all ePHI systems
- [ ] Implement encryption at rest using AES-128/256 per NIST standards
- [ ] Deploy comprehensive audit logging across all ePHI systems
- [ ] Establish audit log review procedures and schedules
- [ ] Implement data integrity controls (hashing, checksums, digital signatures)
- [ ] Deploy multi-factor authentication for ePHI access (especially remote)
- [ ] Implement TLS 1.2+ for all ePHI transmissions
- [ ] Encrypt email containing ePHI (S/MIME, PGP, or enforced TLS)
- [ ] Establish key management procedures per NIST SP 800-57
- [ ] Assess cloud provider technical safeguards and shared responsibility
- [ ] Implement mobile device security controls (MDM, encryption, remote wipe)
- [ ] Secure API access with OAuth 2.0, audit logging, and rate limiting

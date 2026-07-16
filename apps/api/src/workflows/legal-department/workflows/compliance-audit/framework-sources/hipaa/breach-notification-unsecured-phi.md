---
**Document ID:** HIPAA-BN-UNSECURED
**Framework:** HIPAA (Health Insurance Portability and Accountability Act)
**Version:** 1.0
**Effective Date:** April 14, 2003 (Privacy Rule) / February 17, 2010 (HITECH amendments)
**Classification:** Regulatory Framework — Public
**Owner:** U.S. Department of Health and Human Services (HHS)
**Review Cycle:** Per regulatory amendment
**Related Documents:** [HIPAA-BN-REQ], [HIPAA-SR-TECHNICAL], [HIPAA-SR-PHYSICAL], [HIPAA-HITECH], [HIPAA-ENF-PENALTIES]
---

# Guidance on Rendering PHI Unusable, Unreadable, or Indecipherable — Safe Harbor from Breach Notification

## Regulatory Basis
Section 13402(h)(2) of the HITECH Act [HIPAA-HITECH] directs HHS to issue guidance specifying the technologies and methodologies that render PHI unusable, unreadable, or indecipherable to unauthorized individuals. PHI secured through these methods is "secured PHI" and is exempt from breach notification requirements under 45 CFR 164.402. HHS published this guidance on April 17, 2009, and updated it on August 24, 2009.

## Core Principle: The Safe Harbor
If PHI is rendered unusable, unreadable, or indecipherable to unauthorized individuals through the methods specified in HHS guidance, then an unauthorized acquisition, access, use, or disclosure of such PHI does NOT constitute a "breach" and does NOT trigger the notification obligations under [HIPAA-BN-REQ]. This is the **safe harbor** provision.

The safe harbor applies only if the applicable technology or methodology is properly implemented. Partial or improper implementation does not qualify.

## Method 1: Encryption of Electronic PHI

### Standard
Electronic PHI (ePHI) is rendered unusable, unreadable, or indecipherable if it is encrypted in accordance with the processes specified in NIST Special Publication 800-111, Guide to Storage Encryption Technologies for End User Devices, and valid encryption processes for data in motion as specified in NIST Special Publications 800-52, 800-77, and 800-113.

### Encryption at Rest — NIST SP 800-111
Applies to ePHI stored on servers, databases, workstations, laptops, mobile devices, and removable media.

**Approved algorithms and key lengths:**
- AES (Advanced Encryption Standard) — 128-bit, 192-bit, or 256-bit keys (FIPS 197)
- Triple DES (3DES/TDEA) — three independent keys, effective key length of 112 or 168 bits (note: NIST deprecated 3DES for new applications after 2023; AES is strongly preferred)

**Key management requirements per NIST SP 800-57:**
- Encryption keys must be stored separately from the encrypted data.
- Keys must be protected with at least the same level of security as the data they protect.
- Key lifecycle management must include generation, distribution, storage, rotation, revocation, recovery, and destruction.
- Hardware Security Modules (HSMs) are recommended for key storage and cryptographic operations.
- Key rotation should be performed periodically (at least annually for data-at-rest keys, more frequently for high-value systems).
- Compromised keys must be immediately revoked and all data re-encrypted with new keys.

### Encryption in Transit — NIST SP 800-52, 800-77, 800-113

**TLS (Transport Layer Security) — NIST SP 800-52 Rev. 2:**
- Minimum TLS 1.2; TLS 1.3 recommended.
- TLS 1.0 and 1.1 are deprecated and MUST NOT be used.
- Must use approved cipher suites (AES-GCM, AES-CCM, or ChaCha20-Poly1305).
- Server certificates must be validated; certificate pinning recommended for high-security applications.
- Perfect forward secrecy (PFS) cipher suites should be preferred (ECDHE, DHE).

**IPsec VPN — NIST SP 800-77 Rev. 1:**
- For site-to-site and remote access VPN tunnels carrying ePHI.
- Must use AES encryption with IKEv2 for key exchange.
- ESP (Encapsulating Security Payload) must provide both encryption and integrity.

**SSL VPN — NIST SP 800-113:**
- For remote access scenarios using SSL/TLS-based VPN.
- Must follow the same TLS requirements as NIST SP 800-52.

### What Encryption Does NOT Protect Against
The safe harbor does NOT apply if:
- The encryption key was also compromised in the same incident.
- The decryption capability was available to the unauthorized person (e.g., the attacker obtained both encrypted data and the key).
- The encryption was improperly implemented (weak algorithms, known vulnerabilities, improper key management).
- The data was decrypted at the time of unauthorized access (e.g., accessed through a compromised application that had legitimate decryption access).

## Method 2: Destruction of PHI

### Standard for Paper PHI
Paper, film, or other hard-copy media containing PHI must be shredded or destroyed such that the PHI cannot be read or otherwise cannot be reconstructed.

**Acceptable destruction methods for paper:**
- Cross-cut or micro-cut shredding (strip-cut shredding alone may not be sufficient for highly sensitive PHI)
- Incineration
- Pulping
- Chemical destruction

### Standard for Electronic PHI — NIST SP 800-88 Rev. 1
Electronic media containing ePHI must be cleared, purged, or destroyed consistent with NIST SP 800-88, Guidelines for Media Sanitization.

**Three levels of sanitization:**

#### Clear
Applies logical techniques to sanitize data in all user-addressable storage locations for protection against simple non-invasive data recovery techniques. Typically involves overwriting with non-sensitive data.
- Suitable for media that will be re-used within the organization at the same or higher security level.
- Methods: Single-pass overwrite, secure erase commands (ATA Secure Erase for HDDs, Crypto Erase for SEDs).
- NOT sufficient for media leaving organizational control.

#### Purge
Applies physical or logical techniques that render target data recovery infeasible using state-of-the-art laboratory techniques.
- Suitable for media that will leave organizational control (donation, resale, transfer).
- Methods for HDDs: Degaussing using an NSA/CSS-evaluated degausser, or secure overwrite with verification (multiple passes for older drives).
- Methods for SSDs: Crypto erase (sanitize block erase or crypto scramble) per manufacturer specification, or physical destruction if crypto erase is not available/verifiable.
- Methods for flash media (USB, SD cards): Crypto erase if supported, otherwise physical destruction.

#### Destroy
Renders target data recovery infeasible using state-of-the-art laboratory techniques AND results in the inability to use the media for storage.
- Required for media containing highly sensitive ePHI or when Clear/Purge cannot be verified.
- Methods: Disintegration, shredding (media shredder, not paper shredder), pulverization, incineration.
- For HDDs: Degaussing followed by physical destruction.
- For SSDs and flash media: Physical destruction (shredding to particle size of 2mm or smaller recommended).

### Media-Specific Sanitization Guidance

| Media Type | Clear | Purge | Destroy |
|---|---|---|---|
| Magnetic HDD | Single-pass overwrite | Degaussing (NSA-evaluated) or secure erase + verify | Disintegrate, shred, pulverize, or incinerate |
| SSD/Flash | ATA Secure Erase (if supported) | Crypto erase (block erase) | Shred to <=2mm particles, disintegrate, or incinerate |
| Magnetic Tape | Overwrite full tape | Degaussing (NSA-evaluated) | Incinerate or shred |
| Optical (CD/DVD) | N/A | N/A | Shred, pulverize, or incinerate |
| Mobile Devices | Factory reset + crypto erase | Full encryption + crypto erase | Physical destruction |
| Copier/Printer HDDs | Overwrite | Manufacturer sanitize command | Remove and destroy HDD |

### Documentation Requirements for Destruction
All destruction activities must be documented, including:
- Date of destruction
- Description of media destroyed (serial number, asset tag, type)
- Method of destruction used
- Name of person performing or witnessing destruction
- Certification of destruction (especially for third-party destruction vendors)
- Retention of destruction records for 6 years per [HIPAA-PR-ADMIN]

## Interaction with Breach Notification

### Safe Harbor Analysis Flow
1. Was PHI acquired, accessed, used, or disclosed in a manner not permitted by the Privacy Rule?
2. If yes: Was the PHI secured (encrypted per NIST standards or destroyed per NIST SP 800-88)?
3. If secured: **No breach** — safe harbor applies. No notification required. Document the determination.
4. If NOT secured: **Presumed breach** — conduct four-factor risk assessment per [HIPAA-BN-REQ].
5. If risk assessment demonstrates low probability of compromise: No breach notification required. Document the assessment.
6. If risk assessment does NOT demonstrate low probability: **Breach notification required** per [HIPAA-BN-REQ].

### Common Scenarios

**Stolen encrypted laptop:**
- If full-disk encryption with AES-256 was properly enabled and the encryption key was not stored on the device and was not compromised: Safe harbor applies. No breach notification required.

**Lost unencrypted USB drive:**
- No encryption, no destruction: Safe harbor does NOT apply. Four-factor risk assessment required. If PHI contained identifiers and clinical data, breach notification is likely required.

**Disposed hard drive without sanitization:**
- If the hard drive was not cleared, purged, or destroyed per NIST SP 800-88: Safe harbor does NOT apply. The PHI remains unsecured.

**Ransomware attack on encrypted database:**
- If the attacker accessed the data through the application layer (bypassing encryption at rest): Encryption safe harbor does NOT apply because the data was decrypted during access. Four-factor risk assessment required.

## Implementation Checklist
- [ ] Implement AES-128 or AES-256 encryption at rest for all ePHI per NIST SP 800-111
- [ ] Implement TLS 1.2+ encryption in transit for all ePHI per NIST SP 800-52
- [ ] Establish key management program per NIST SP 800-57
- [ ] Store encryption keys separately from encrypted data
- [ ] Deploy HSMs for key storage in high-security environments
- [ ] Implement key rotation schedule (at least annual)
- [ ] Develop media sanitization procedures per NIST SP 800-88 Rev. 1
- [ ] Select appropriate sanitization level (Clear/Purge/Destroy) based on media type and disposition
- [ ] Establish paper PHI destruction procedures (cross-cut shredding or incineration)
- [ ] Create destruction documentation and certification process
- [ ] Train workforce on safe harbor requirements and breach determination workflow
- [ ] Document all safe harbor determinations with supporting evidence
- [ ] Retain all encryption and destruction records for 6 years per [HIPAA-PR-ADMIN]

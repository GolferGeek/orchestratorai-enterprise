---
**Document ID:** HIPAA-SR-PHYSICAL
**Framework:** HIPAA (Health Insurance Portability and Accountability Act)
**Version:** 1.0
**Effective Date:** April 14, 2003 (Privacy Rule) / February 17, 2010 (HITECH amendments)
**Classification:** Regulatory Framework — Public
**Owner:** U.S. Department of Health and Human Services (HHS)
**Review Cycle:** Per regulatory amendment
**Related Documents:** [HIPAA-SR-ADMIN], [HIPAA-SR-TECHNICAL], [HIPAA-SR-ORG], [HIPAA-PR-ADMIN], [HIPAA-ENF-PENALTIES]
---

# Security Rule — Physical Safeguards

## Regulatory Basis
45 CFR 164.310 establishes physical safeguards that covered entities and business associates must implement to protect electronic information systems and related buildings and equipment from natural and environmental hazards and unauthorized intrusion. Physical safeguards are one of three safeguard categories (administrative, physical, technical) required by the Security Rule.

## Required vs. Addressable Specifications
Each implementation specification is designated as either **required (R)** or **addressable (A)**. Addressable specifications require documented assessment — implement if reasonable and appropriate, or document rationale for alternative measures or non-applicability.

## Standard 1: Facility Access Controls — 45 CFR 164.310(a)(1)
Implement policies and procedures to limit physical access to electronic information systems and the facility or facilities in which they are housed, while ensuring that properly authorized access is allowed.

### Contingency Operations (A)
Establish and implement procedures that allow facility access in support of restoration of lost data under the disaster recovery plan and emergency mode operations plan per [HIPAA-SR-ADMIN] Standard 7.
- Must define who has emergency access authority.
- Must specify the process for granting temporary access during emergencies.
- Must document all emergency access events.

### Facility Security Plan (A)
Implement policies and procedures to safeguard the facility and the equipment therein from unauthorized physical access, tampering, and theft.
- Must address physical barriers (locks, doors, walls, fencing).
- Must address access control mechanisms (key cards, biometrics, guards).
- Must address environmental controls (fire suppression, water damage prevention, climate control).
- Must address monitoring (surveillance cameras, intrusion detection, alarm systems).
- Must be reviewed and updated periodically in response to environmental changes.
- Must coordinate with risk analysis findings per [HIPAA-SR-ADMIN].

### Access Control and Validation Procedures (A)
Implement procedures to control and validate a person's access to facilities based on their role or function, including visitor control and control of access to software programs for testing and revision.
- Must define access levels by role and responsibility.
- Must implement visitor sign-in/sign-out procedures.
- Must include escort requirements for unauthorized individuals.
- Must control access to server rooms, data centers, and areas housing ePHI systems.
- Must validate identity before granting access.

### Maintenance Records (A)
Implement policies and procedures to document repairs and modifications to the physical components of a facility which are related to security (such as hardware, walls, doors, and locks).
- Must log all security-related maintenance activities.
- Must document who performed the maintenance, what was done, and when.
- Must track vendor access for maintenance purposes.
- Maintenance records should be retained consistent with the 6-year documentation requirement per [HIPAA-PR-ADMIN].

## Standard 2: Workstation Use — 45 CFR 164.310(b)

### Workstation Use (R)
Implement policies and procedures that specify the proper functions to be performed, the manner in which those functions are to be performed, and the physical attributes of the surroundings of a specific workstation or class of workstation that can access ePHI.
- "Workstation" includes desktops, laptops, tablets, smartphones, and any other electronic computing device used to create, receive, maintain, or transmit ePHI.
- Policies must address the physical environment (screen visibility, public areas, remote work locations).
- Must address acceptable use requirements specific to ePHI access.
- Must address auto-lock and screen timeout requirements.
- Must address physical positioning of screens to prevent unauthorized viewing.
- Must address restrictions on using personal devices (BYOD policies).
- Remote and home-office workstations must meet the same standards as on-premises workstations.

## Standard 3: Workstation Security — 45 CFR 164.310(c)

### Workstation Security (R)
Implement physical safeguards for all workstations that access ePHI to restrict access to authorized users.
- Must include physical access controls for workstations (cable locks, secure areas, locked offices).
- Must address theft prevention measures for portable devices.
- Must address secure storage when workstations are not in use.
- Must distinguish between shared and individual workstations with appropriate controls.
- Must address physical security of remote workstations (home offices, travel).

## Standard 4: Device and Media Controls — 45 CFR 164.310(d)(1)
Implement policies and procedures that govern the receipt and removal of hardware and electronic media that contain ePHI into and out of a facility, and the movement of these items within the facility.

### Disposal (R)
Implement policies and procedures to address the final disposition of ePHI and/or the hardware or electronic media on which it is stored.
- Must ensure ePHI is rendered unreadable, indecipherable, and irrecoverable prior to disposal.
- Methods include physical destruction (shredding, degaussing, pulverizing) and logical destruction (cryptographic erasure, secure wipe conforming to NIST SP 800-88 guidelines).
- Must apply to all media types: hard drives, solid-state drives, USB drives, CDs, DVDs, backup tapes, mobile devices.
- Must document all disposal activities including date, method, personnel, and media inventory tracking.
- See [HIPAA-BN-UNSECURED] for intersection with breach notification safe harbor through destruction.

### Media Re-Use (R)
Implement procedures for removal of ePHI from electronic media before the media are made available for re-use.
- Must ensure complete sanitization before re-deployment.
- Must follow NIST SP 800-88 Guidelines for Media Sanitization (Clear, Purge, or Destroy based on risk level and media type).
- Must document sanitization activities and verify effectiveness.
- Re-used media should be tracked through inventory controls.

### Accountability (A)
Maintain a record of the movements of hardware and electronic media and any person responsible therefor.
- Must include an inventory or asset tracking system for all media and devices containing ePHI.
- Must record the location, custodian, and status of each device/media.
- Must track transfers between locations, departments, or individuals.
- Must include decommissioning and surplus tracking.

### Data Backup and Storage (A)
Create a retrievable, exact copy of ePHI, when needed, before movement of equipment.
- Must create verified backup before any hardware relocation.
- Must verify backup integrity before proceeding with move.
- Must coordinate with contingency planning requirements per [HIPAA-SR-ADMIN] Standard 7.

## Physical Safeguards and Cloud Computing
For entities using cloud-based infrastructure:
- The cloud service provider (CSP) is typically a business associate and must execute a BAA per [HIPAA-SR-ORG].
- Physical safeguards at the CSP data center are the CSP's responsibility under the BAA.
- The covered entity retains responsibility for endpoint security (workstations, devices accessing cloud ePHI).
- Due diligence on the CSP's physical security practices is part of the risk analysis per [HIPAA-SR-ADMIN].
- SOC 2 Type II reports, ISO 27001 certifications, and FedRAMP authorizations may provide evidence of CSP physical safeguard compliance.

## Relationship to Other Safeguard Categories
- Physical safeguards complement administrative safeguards (policies and training per [HIPAA-SR-ADMIN]) and technical safeguards (access controls and encryption per [HIPAA-SR-TECHNICAL]).
- Gaps in physical safeguards increase reliance on technical safeguards (e.g., encryption at rest compensates for device theft risk).
- The risk analysis per [HIPAA-SR-ADMIN] must assess physical threats and vulnerabilities alongside administrative and technical ones.

## Implementation Checklist
- [ ] Develop facility security plan addressing all physical access points
- [ ] Implement access control mechanisms (badges, biometrics, keys) for ePHI areas
- [ ] Establish visitor management procedures with sign-in, escort, and sign-out
- [ ] Document contingency access procedures for disaster recovery scenarios
- [ ] Create maintenance logging procedures for security-related facility modifications
- [ ] Develop workstation use policies covering all device types including remote/BYOD
- [ ] Implement physical workstation security measures (cable locks, secure areas)
- [ ] Establish device and media disposal procedures per NIST SP 800-88
- [ ] Create media re-use sanitization procedures with verification
- [ ] Implement hardware and media asset tracking/inventory system
- [ ] Establish pre-move data backup procedures for equipment relocation
- [ ] Conduct physical security assessment as part of risk analysis per [HIPAA-SR-ADMIN]
- [ ] Review cloud provider physical safeguards and BAA compliance per [HIPAA-SR-ORG]

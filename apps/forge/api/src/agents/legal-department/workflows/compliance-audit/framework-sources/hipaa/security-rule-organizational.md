---
**Document ID:** HIPAA-SR-ORG
**Framework:** HIPAA (Health Insurance Portability and Accountability Act)
**Version:** 1.0
**Effective Date:** April 14, 2003 (Privacy Rule) / February 17, 2010 (HITECH amendments)
**Classification:** Regulatory Framework — Public
**Owner:** U.S. Department of Health and Human Services (HHS)
**Review Cycle:** Per regulatory amendment
**Related Documents:** [HIPAA-SR-ADMIN], [HIPAA-SR-PHYSICAL], [HIPAA-SR-TECHNICAL], [HIPAA-PR-USE], [HIPAA-HITECH], [HIPAA-ENF-PENALTIES]
---

# Security Rule — Organizational Requirements

## Regulatory Basis
45 CFR 164.314 establishes organizational requirements for business associate arrangements and group health plan administration under the Security Rule. These requirements ensure that ePHI protections extend beyond the covered entity to all entities that create, receive, maintain, or transmit ePHI on its behalf.

## Standard 1: Business Associate Contracts or Other Arrangements — 45 CFR 164.314(a)

### Business Associate Contract (R)
A covered entity may permit a business associate to create, receive, maintain, or transmit ePHI on the covered entity's behalf only if the covered entity obtains satisfactory assurances, documented through a written contract or other arrangement, that the business associate will appropriately safeguard the information.

### Required BAA Provisions — 45 CFR 164.314(a)(2)(i)
The business associate agreement (BAA) must:

1. **Establish permitted and required uses and disclosures.** The contract must not authorize the business associate to use or further disclose ePHI in a manner that would violate the Security Rule, Privacy Rule, or Breach Notification Rule if done by the covered entity, except as permitted for the business associate's own management and administration or to carry out legal responsibilities.

2. **Require safeguard implementation.** The business associate must implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of the ePHI it creates, receives, maintains, or transmits on behalf of the covered entity, in accordance with [HIPAA-SR-ADMIN], [HIPAA-SR-PHYSICAL], and [HIPAA-SR-TECHNICAL].

3. **Require breach reporting.** The business associate must report to the covered entity any security incident of which it becomes aware, including breaches of unsecured PHI, per [HIPAA-BN-REQ].

4. **Require subcontractor compliance.** The business associate must ensure that any subcontractors that create, receive, maintain, or transmit ePHI on behalf of the business associate agree to the same restrictions and conditions that apply to the business associate under the BAA. This includes requiring written agreements with subcontractors (sub-BAAs) per HITECH [HIPAA-HITECH].

5. **Require availability of information for accounting.** The business associate must make available information required to provide an accounting of disclosures per [HIPAA-PR-RIGHTS].

6. **Require access to PHI.** The business associate must make PHI available to individuals exercising their right of access per [HIPAA-PR-RIGHTS], to the extent the business associate maintains such information.

7. **Require amendment of PHI.** The business associate must make PHI available for amendment and incorporate amendments as required per [HIPAA-PR-RIGHTS].

8. **Require HHS access.** The business associate must make its internal practices, books, and records relating to the use and disclosure of PHI available to the Secretary of HHS for determining the covered entity's compliance.

9. **Require return or destruction.** At termination of the contract, the business associate must return or destroy all PHI received from or created or received on behalf of the covered entity. If return or destruction is not feasible, the contract must extend protections to the information and limit further uses and disclosures to those purposes that make return or destruction infeasible.

10. **Authorize termination.** The contract must authorize the covered entity to terminate the contract if the covered entity determines that the business associate has violated a material term of the contract.

### HITECH Amendments to BAA Requirements [HIPAA-HITECH]
Under HITECH (effective February 17, 2010):
- Business associates are **directly liable** for compliance with Security Rule safeguards, not just contractually obligated through the BAA.
- Business associates are directly subject to the Breach Notification Rule requirements.
- Business associates are directly subject to civil and criminal penalties under [HIPAA-ENF-PENALTIES].
- Business associates must enter into BAAs with their subcontractors (downstream BAAs).
- The "conduit exception" applies narrowly: organizations that merely transmit ePHI (e.g., the postal service, Internet Service Providers acting purely as conduits) and do not access ePHI on a routine basis are not business associates.

### Other Arrangements — 45 CFR 164.314(a)(2)(ii)
When a covered entity and its business associate are both governmental entities:
- The covered entity may comply through a memorandum of understanding (MOU) instead of a formal contract, provided the MOU contains the same required provisions.
- If the arrangement is required by law, a written contract is not necessary provided the covered entity complies through other means as outlined in the regulation.

### Noncompliance and Remediation
- If the covered entity knows of a pattern of activity or practice of the business associate that constitutes a material breach or violation of the BAA, the covered entity must take reasonable steps to cure the breach or end the violation.
- If such steps are unsuccessful, the covered entity must terminate the contract if feasible.
- If termination is not feasible, the covered entity must report the problem to HHS.

## Standard 2: Requirements for Group Health Plans — 45 CFR 164.314(b)

### Plan Document Requirements (R)
Except when the only ePHI disclosed to a plan sponsor is enrollment/disenrollment information or summary health information per 45 CFR 164.504(f), the plan documents of the group health plan must be amended to incorporate provisions that require the plan sponsor to:

1. **Implement safeguards.** Implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of the ePHI that it creates, receives, maintains, or transmits on behalf of the group health plan.

2. **Ensure adequate separation.** Ensure that adequate separation is maintained between the group health plan and the plan sponsor, consistent with the Security Rule. This requires the plan sponsor to:
   - Implement appropriate access controls (firewall, access restrictions) between plan administration functions and other plan sponsor functions.
   - Ensure that only authorized employees in the plan administration function have access to ePHI.
   - Prevent access by the plan sponsor's other business units.

3. **Ensure agent compliance.** Ensure that any agent, including a subcontractor, to whom the plan sponsor provides ePHI agrees to implement reasonable and appropriate security measures.

4. **Report security incidents.** Report to the group health plan any security incident of which the plan sponsor becomes aware.

## Determining Business Associate Status

### Who Is a Business Associate?
A business associate is a person or entity (other than a member of the covered entity's workforce) that performs functions or activities on behalf of, or provides certain services to, a covered entity that involve the use or disclosure of PHI. Common examples include:

- Claims processing or administration
- Data analysis, processing, or administration
- Utilization review
- Quality assurance
- Billing
- Practice management
- Benefit management
- Repricing
- Legal, actuarial, accounting, consulting, data aggregation, management, administrative, accreditation, or financial services
- Cloud service providers hosting ePHI
- Health information exchanges (HIEs)
- Personal health record (PHR) vendors (when offered by or on behalf of a covered entity)
- Electronic prescribing gateways
- Patient safety organizations

### Who Is NOT a Business Associate?
- Members of the covered entity's own workforce (employees, volunteers, trainees)
- Other covered entities when disclosing PHI for treatment purposes
- Conduit entities (ISPs, postal services) that merely transport PHI without accessing it on a routine basis
- A person or organization that acts merely as a conduit for PHI by transporting information but does not access the information other than on a random or infrequent basis

## BAA Management Best Practices
While not explicitly required by HIPAA, HHS enforcement actions and OCR guidance indicate the following practices reduce risk:
- Maintain a centralized BAA inventory tracking all business associates, agreement dates, renewal dates, and scope.
- Conduct periodic due diligence on business associate security practices (questionnaires, audits, certifications).
- Require business associates to provide evidence of compliance (SOC 2 reports, penetration test results, HITRUST certification).
- Review and update BAAs at least annually and whenever there is a material change in the relationship or services.
- Include incident response coordination procedures in the BAA (notification timelines, contact persons, joint investigation procedures).
- Track subcontractor chains — the covered entity should know who has downstream access to its ePHI.

## Implementation Checklist
- [ ] Identify all business associates that create, receive, maintain, or transmit ePHI
- [ ] Execute BAAs with all identified business associates containing all 10 required provisions
- [ ] Establish subcontractor tracking and ensure sub-BAAs are in place
- [ ] Create centralized BAA inventory with tracking for renewals and amendments
- [ ] Implement due diligence procedures for business associate security assessment
- [ ] Establish breach reporting procedures between covered entity and business associates
- [ ] Define termination procedures for noncompliant business associates
- [ ] Amend group health plan documents to include required security provisions (if applicable)
- [ ] Implement adequate separation between plan administration and plan sponsor (if applicable)
- [ ] Establish periodic BAA review and update schedule
- [ ] Document conduit exception determinations with supporting rationale
- [ ] Train workforce on business associate identification and BAA requirements

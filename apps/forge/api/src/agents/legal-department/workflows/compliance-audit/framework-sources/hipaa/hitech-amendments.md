---
**Document ID:** HIPAA-HITECH
**Framework:** HIPAA (Health Insurance Portability and Accountability Act)
**Version:** 1.0
**Effective Date:** April 14, 2003 (Privacy Rule) / February 17, 2010 (HITECH amendments)
**Classification:** Regulatory Framework — Public
**Owner:** U.S. Department of Health and Human Services (HHS)
**Review Cycle:** Per regulatory amendment
**Related Documents:** [HIPAA-PR-USE], [HIPAA-PR-RIGHTS], [HIPAA-PR-ADMIN], [HIPAA-SR-ADMIN], [HIPAA-SR-ORG], [HIPAA-BN-REQ], [HIPAA-BN-UNSECURED], [HIPAA-ENF-PENALTIES]
---

# HITECH Act — Key Amendments to HIPAA

## Regulatory Basis
The Health Information Technology for Economic and Clinical Health Act (HITECH) was enacted as Title XIII of the American Recovery and Reinvestment Act of 2009 (ARRA), Public Law 111-5, on February 17, 2009. The HITECH Act significantly strengthened HIPAA's privacy and security provisions, established breach notification requirements, increased penalties, and promoted the adoption of electronic health records (EHRs). The Omnibus Rule (January 25, 2013, effective March 26, 2013) implemented the final HITECH amendments.

## Direct Applicability to Business Associates — HITECH Section 13401

### Before HITECH
Business associates were bound to HIPAA only through contractual obligations in Business Associate Agreements (BAAs) with covered entities. HHS could not directly enforce HIPAA against business associates.

### After HITECH
Business associates are **directly liable** under HIPAA for:
- All Security Rule safeguards (administrative, physical, technical) per [HIPAA-SR-ADMIN], [HIPAA-SR-PHYSICAL], [HIPAA-SR-TECHNICAL].
- Security Rule organizational requirements per [HIPAA-SR-ORG].
- Privacy Rule provisions applicable to covered entities, to the extent the business associate performs functions on behalf of the covered entity.
- Breach notification obligations per [HIPAA-BN-REQ].
- Civil and criminal penalties per [HIPAA-ENF-PENALTIES].

### Subcontractor Chain
Business associates must ensure that their subcontractors who create, receive, maintain, or transmit PHI agree to the same restrictions and conditions. This requires written agreements (sub-BAAs) flowing down through the entire chain of entities handling PHI. A subcontractor of a business associate is itself a business associate under HITECH.

## Breach Notification Requirements — HITECH Section 13402

HITECH established the breach notification requirements now codified at 45 CFR 164.400-414. See [HIPAA-BN-REQ] for detailed requirements. Key provisions:

- **Individual notification:** Within 60 days of discovery of a breach of unsecured PHI.
- **HHS notification:** Concurrent for breaches affecting 500+ individuals; annual for breaches affecting fewer than 500.
- **Media notification:** For breaches affecting 500+ individuals in a single state or jurisdiction.
- **Safe harbor:** No notification required if PHI was encrypted or destroyed per HHS guidance. See [HIPAA-BN-UNSECURED].
- **Burden of proof:** The covered entity or business associate bears the burden of demonstrating that a use or disclosure did not constitute a breach or that notification was provided.

## Increased Penalties — HITECH Section 13410

### Four-Tier Civil Penalty Structure
HITECH replaced the single-tier penalty structure with four tiers based on culpability. See [HIPAA-ENF-PENALTIES] for detailed amounts. Key changes:
- Maximum annual penalty increased from $25,000 to $1.5 million per violation category (now $2M+ with inflation adjustments).
- Violations due to **willful neglect** that are not corrected trigger mandatory investigation and mandatory penalties — HHS has no discretion to decline enforcement.
- Percentage of civil monetary penalties and settlements may be distributed to harmed individuals (at the Secretary's discretion).

### State Attorney General Enforcement — HITECH Section 13410(e)
HITECH granted state attorneys general the authority to bring civil actions in federal district court for HIPAA violations affecting state residents. See [HIPAA-ENF-PENALTIES] for details. This created a second enforcement pathway independent of (but coordinated with) HHS/OCR.

## Mandatory Audits — HITECH Section 13411
HITECH requires HHS to provide for periodic audits of covered entities and business associates to ensure compliance with HIPAA Privacy, Security, and Breach Notification Rules. OCR has conducted audit programs (Phase 1 in 2011-2012, Phase 2 in 2016-2017) and continues desk audits and targeted reviews as part of ongoing enforcement.

## Electronic Health Record (EHR) Provisions

### Meaningful Use / Promoting Interoperability
HITECH established incentive programs (administered by CMS) to promote the adoption of certified EHR technology:
- **Medicare EHR Incentive Program:** Up to $44,000 per eligible professional; up to $2 million per eligible hospital.
- **Medicaid EHR Incentive Program:** Up to $63,750 per eligible professional; variable for hospitals.
- Programs have transitioned through Stage 1, Stage 2, and Stage 3 requirements, now called **Promoting Interoperability**.
- Failure to demonstrate meaningful use results in Medicare payment adjustments (penalties) beginning at 1% and increasing up to 5%.

### HIPAA Intersection
While EHR incentive programs are primarily CMS programs, HIPAA compliance is a foundation:
- Certified EHR technology must support HIPAA-required security functions (access controls, audit logging, encryption).
- Privacy and security risk analysis is a core requirement of Promoting Interoperability.
- Interoperability requirements must be balanced with HIPAA's minimum necessary standard per [HIPAA-PR-USE].

## Accounting of Disclosures Expansion — HITECH Section 13405(c)

### Pre-HITECH
Accounting of disclosures under [HIPAA-PR-RIGHTS] excluded disclosures for treatment, payment, and healthcare operations (TPO).

### HITECH Amendment
For covered entities using or maintaining an electronic health record (EHR), individuals have the right to receive an accounting of disclosures made through the EHR for treatment, payment, and healthcare operations during the three years prior to the request.
- This significantly expands the scope of disclosures that must be tracked.
- HHS has delayed the implementation of this provision pending further rulemaking.
- Organizations using EHRs should monitor HHS for final rules on this expanded accounting requirement.
- Current best practice: Implement system capabilities to track and report EHR-based disclosures in anticipation of final rulemaking.

## Minimum Necessary Refined — HITECH Section 13405(b)

### Pre-HITECH
The minimum necessary standard under [HIPAA-PR-USE] required reasonable efforts to limit PHI, but the definition of "minimum necessary" was somewhat vague.

### HITECH Amendment
HITECH directs HHS to issue guidance on what constitutes "minimum necessary," and until such guidance is issued, a covered entity or business associate is in compliance if it limits requests for, uses of, or disclosures of PHI to a **limited data set** (as defined in 45 CFR 164.514(e)) or, if needed by the entity, to the minimum necessary to accomplish the intended purpose.

The limited data set excludes the following direct identifiers:
- Names
- Postal addresses (other than town/city, state, zip code)
- Telephone numbers, fax numbers, email addresses
- Social Security numbers
- Medical record numbers, health plan beneficiary numbers
- Account numbers, certificate/license numbers
- Vehicle identifiers, device identifiers
- Web URLs, IP addresses
- Biometric identifiers
- Full-face photographs

## Marketing Restrictions — HITECH Section 13406

### Pre-HITECH
Marketing communications generally required authorization, but certain exceptions existed for face-to-face communications and gifts of nominal value.

### HITECH Amendments
- **No remuneration:** A covered entity or business associate may NOT receive financial remuneration (direct or indirect payment) from or on behalf of a third party in exchange for making a communication about a product or service without valid authorization from the individual.
- **Treatment/healthcare operations exception:** Communications about health-related products or services offered by the covered entity (or by a third party) are marketing if the covered entity receives financial remuneration for making the communication.
- **Refill reminders and adherence communications:** These are NOT marketing if the financial remuneration is reasonably related to the covered entity's cost of making the communication. The authorization requirement applies if remuneration exceeds this threshold.
- The Notice of Privacy Practices must describe these restrictions per [HIPAA-PR-NOTICE].

## Fundraising Restrictions — HITECH Section 13406

### Pre-HITECH
Covered entities could use certain PHI (demographic information and dates of service) for fundraising without authorization, subject to opt-out.

### HITECH Amendments
- Fundraising communications must clearly and conspicuously provide an opportunity to **opt out** of receiving further fundraising communications.
- The covered entity must treat an opt-out request as a revocation of authorization for future fundraising communications.
- The opt-out method must not be unduly burdensome.
- The Notice of Privacy Practices must inform individuals of the right to opt out of fundraising per [HIPAA-PR-NOTICE].
- Covered entities may use or disclose to a business associate or institutionally related foundation: demographic information, dates of health care, department of service, treating physician, outcome information, and health insurance status for fundraising purposes.

## Sale of PHI Prohibition — HITECH Section 13405(d)

### Prohibition
A covered entity or business associate may NOT directly or indirectly receive remuneration in exchange for PHI unless the covered entity or business associate obtains a valid authorization from the individual that includes a specification that PHI may be sold and that remuneration will result.

### Exceptions (authorization NOT required for remuneration)
1. **Public health activities** per [HIPAA-PR-USE]
2. **Research** — where the price charged reflects the cost of preparation and transmittal (not the value of the PHI itself), or where authorization is obtained
3. **Treatment of the individual**
4. **Sale, transfer, merger, or consolidation** of all or part of the covered entity
5. **Business associate performing activities** on behalf of the covered entity per the BAA
6. **Providing PHI to the individual** when requested
7. **Other purposes** as determined by the Secretary through regulation

### Key Distinction
The prohibition targets situations where PHI itself is the product being sold (e.g., selling patient lists to marketers). It does not prohibit normal business relationships where PHI is disclosed as part of providing health care services.

## Implementation Checklist
- [ ] Ensure all business associates are directly compliant with Security Rule (not just contractually)
- [ ] Execute sub-BAAs with all subcontractors in the PHI chain
- [ ] Implement breach notification procedures per [HIPAA-BN-REQ] timeline requirements
- [ ] Update penalty risk assessments to reflect HITECH-era maximums per [HIPAA-ENF-PENALTIES]
- [ ] Prepare for OCR audit readiness (risk analysis, policies, training, BAA inventory)
- [ ] Implement EHR disclosure tracking capabilities in anticipation of expanded accounting rules
- [ ] Review and restrict marketing communications involving third-party remuneration
- [ ] Implement fundraising opt-out mechanisms and tracking
- [ ] Audit all PHI disclosures for potential sale-of-PHI violations
- [ ] Update Notice of Privacy Practices to reflect HITECH amendments per [HIPAA-PR-NOTICE]
- [ ] Train workforce on HITECH-specific changes (BA liability, breach notification, marketing/sale restrictions)
- [ ] Monitor HHS rulemaking for final implementation of expanded accounting of disclosures
- [ ] Coordinate with state AG offices on compliance expectations in operating jurisdictions

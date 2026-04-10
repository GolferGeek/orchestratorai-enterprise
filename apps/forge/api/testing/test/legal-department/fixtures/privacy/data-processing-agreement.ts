/**
 * Fixture: Data Processing Agreement (DPA)
 *
 * A GDPR-compliant data processing agreement between a data controller
 * and a data processor. Triggers privacy, compliance, and corporate specialists.
 *
 * KNOWN RISKS:
 * - Section 3.4: Processor can use sub-processors without prior notice   → HIGH
 * - Section 5.3: Breach notification window is 96 hours (GDPR requires 72) → CRITICAL
 * - Section 7: No data deletion commitment, only "reasonable efforts"     → HIGH
 * - Section 8.2: Indemnification for processor's GDPR fines limited to €10K → CRITICAL
 * - Section 10: Controller bears all audit costs, even for processor fault  → MEDIUM
 *
 * KNOWN METADATA:
 * - Type: privacy / DPA / data processing agreement
 * - Parties: EuroTech Solutions GmbH (processor), Nordstrom Health AG (controller)
 * - Effective Date: February 1, 2025
 * - Signatures: Klaus Weber (CTO, EuroTech), Dr. Ingrid Larsson (DPO, Nordstrom)
 */

export const DATA_PROCESSING_AGREEMENT = {
  filename: 'data-processing-agreement.txt',
  mimeType: 'text/plain',
  documentType: 'privacy',
  subType: 'dpa',

  parties: [
    { name: 'EuroTech Solutions GmbH', type: 'gmbh', jurisdiction: 'Germany', role: 'processor' },
    { name: 'Nordstrom Health AG', type: 'ag', jurisdiction: 'Switzerland', role: 'controller' },
  ],

  dates: {
    effective: '2025-02-01',
  },

  signers: [
    { name: 'Klaus Weber', title: 'Chief Technology Officer', party: 'EuroTech Solutions GmbH' },
    { name: 'Dr. Ingrid Larsson', title: 'Data Protection Officer', party: 'Nordstrom Health AG' },
  ],

  expectedSectionCount: 12,

  knownRisks: {
    subProcessorNotice: { section: 3, expectedMinRisk: 'high' as const },
    breachNotificationWindow: { section: 5, expectedMinRisk: 'critical' as const },
    noDataDeletion: { section: 7, expectedMinRisk: 'high' as const },
    limitedFineIndemnification: { section: 8, expectedMinRisk: 'critical' as const },
    auditCosts: { section: 10, expectedMinRisk: 'medium' as const },
  },

  text: `DATA PROCESSING AGREEMENT

This Data Processing Agreement ("DPA") is entered into as of February 1, 2025 ("Effective Date"), by and between:

Nordstrom Health AG, a Swiss corporation (Aktiengesellschaft) with its registered office at Bahnhofstrasse 42, 8001 Zurich, Switzerland ("Controller"), and

EuroTech Solutions GmbH, a German limited liability company (Gesellschaft mit beschränkter Haftung) with its registered office at Friedrichstraße 123, 10117 Berlin, Germany ("Processor").

This DPA is entered into in connection with the Master Service Agreement between the Parties dated January 15, 2025 (the "Principal Agreement"), under which Processor provides cloud infrastructure and data analytics services to Controller.

SECTION 1. DEFINITIONS

1.1 "Personal Data" means any information relating to an identified or identifiable natural person ("Data Subject"), as defined in Article 4(1) of the General Data Protection Regulation (EU) 2016/679 ("GDPR").

1.2 "Processing" means any operation performed on Personal Data, including collection, recording, organization, structuring, storage, adaptation, alteration, retrieval, consultation, use, disclosure, dissemination, alignment, combination, restriction, erasure, and destruction.

1.3 "Sub-processor" means any third party engaged by Processor to process Personal Data on behalf of Controller.

1.4 "Data Breach" means a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, Personal Data.

1.5 "Standard Contractual Clauses" or "SCCs" means the standard contractual clauses approved by the European Commission for the transfer of Personal Data to third countries.

SECTION 2. SCOPE AND PURPOSE OF PROCESSING

2.1 Processor shall process Personal Data only on documented instructions from Controller, including with regard to transfers of Personal Data to a third country, unless required to do so by European Union or Member State law.

2.2 The categories of Personal Data processed include: patient identification data, health records, treatment histories, insurance information, contact details, and employee records of Controller's staff.

2.3 The categories of Data Subjects include: patients of Controller's healthcare facilities, healthcare professionals, administrative staff, and business contacts.

2.4 The purpose of Processing is to provide cloud hosting, data analytics, reporting, and AI-assisted diagnostics services as described in the Principal Agreement.

SECTION 3. SUB-PROCESSORS

3.1 Controller grants Processor general written authorization to engage Sub-processors for the Processing of Personal Data.

3.2 Processor shall maintain a list of current Sub-processors, which as of the Effective Date includes: (a) Amazon Web Services EMEA SARL (cloud hosting, Frankfurt region); (b) Elastic NV (search and analytics); and (c) MongoDB Atlas (database services, EU region).

3.3 Processor shall impose data protection obligations on Sub-processors that are materially equivalent to those set forth in this DPA by way of a written contract.

3.4 Processor may add or replace Sub-processors at any time. Processor shall update the Sub-processor list on its website and shall not be required to provide prior notice to Controller of any changes. Controller may check the list at its convenience.

SECTION 4. TECHNICAL AND ORGANIZATIONAL MEASURES

4.1 Processor shall implement and maintain appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including: (a) encryption of Personal Data at rest (AES-256) and in transit (TLS 1.3); (b) role-based access controls with multi-factor authentication; (c) regular vulnerability assessments and penetration testing; (d) automated backup with geographic redundancy within the EU; and (e) employee security awareness training.

4.2 Processor shall regularly test, assess, and evaluate the effectiveness of the measures described in Section 4.1.

SECTION 5. DATA BREACH NOTIFICATION

5.1 Processor shall notify Controller of any Data Breach without undue delay after becoming aware of the breach.

5.2 The notification shall include: (a) a description of the nature of the breach; (b) the categories and approximate number of Data Subjects affected; (c) the likely consequences of the breach; and (d) the measures taken or proposed to address the breach.

5.3 Processor shall provide the initial notification to Controller within ninety-six (96) hours of becoming aware of the Data Breach. Processor may provide the required information in phases if it is not possible to provide all information simultaneously.

5.4 Processor shall cooperate with Controller in investigating the Data Breach and in any notification to supervisory authorities or Data Subjects.

SECTION 6. DATA SUBJECT RIGHTS

6.1 Processor shall assist Controller in fulfilling its obligation to respond to requests from Data Subjects exercising their rights under Chapter III of the GDPR, including the right of access, rectification, erasure, data portability, restriction of processing, and objection.

6.2 If Processor receives a request directly from a Data Subject, Processor shall promptly redirect the Data Subject to Controller and shall not respond to the request directly without Controller's authorization.

SECTION 7. DATA RETURN AND DELETION

7.1 Upon termination of the Principal Agreement, Processor shall, at Controller's choice, return all Personal Data to Controller in a commonly used, machine-readable format or delete all Personal Data in its possession.

7.2 Processor shall use reasonable efforts to delete Personal Data from its systems within one hundred eighty (180) days of termination. Processor may retain copies of Personal Data to the extent required by applicable law, provided that such retained data continues to be subject to the terms of this DPA.

7.3 Processor shall not be required to delete Personal Data from backup systems until such backups are overwritten in the ordinary course of business.

SECTION 8. LIABILITY AND INDEMNIFICATION

8.1 Each Party shall be liable for damages caused by Processing that violates this DPA or the GDPR, in accordance with Article 82 of the GDPR.

8.2 Processor's total aggregate liability for all claims arising under this DPA, including but not limited to administrative fines imposed by supervisory authorities under Article 83 of the GDPR, shall not exceed ten thousand euros (€10,000.00).

8.3 Controller shall indemnify Processor against all claims, damages, and costs arising from Controller's instructions that violate applicable data protection law, provided that Processor has informed Controller of such violation in accordance with Article 28(3) of the GDPR.

SECTION 9. INTERNATIONAL DATA TRANSFERS

9.1 Processor shall not transfer Personal Data to any country outside the European Economic Area ("EEA") or Switzerland without ensuring that adequate safeguards are in place, including: (a) an adequacy decision by the European Commission; (b) Standard Contractual Clauses; or (c) Binding Corporate Rules approved by a competent supervisory authority.

9.2 If Processor uses Sub-processors located outside the EEA, Processor shall ensure that the transfer is subject to appropriate safeguards as described in Section 9.1.

SECTION 10. AUDIT RIGHTS

10.1 Controller shall have the right to audit Processor's compliance with this DPA, including by requesting and reviewing relevant documentation, certifications, and audit reports.

10.2 On-site audits shall be conducted at Controller's sole expense, including all travel, personnel, and consulting costs, regardless of the audit findings. On-site audits shall be limited to once per calendar year and shall be conducted during normal business hours upon thirty (30) days' prior written notice.

10.3 Processor shall make available to Controller all information necessary to demonstrate compliance with this DPA and shall contribute to audits conducted by Controller or an auditor mandated by Controller.

SECTION 11. TERM AND TERMINATION

11.1 This DPA shall remain in effect for the duration of the Principal Agreement and shall automatically terminate upon termination of the Principal Agreement.

11.2 The obligations regarding confidentiality, data return/deletion, and liability shall survive termination.

SECTION 12. GENERAL PROVISIONS

12.1 Governing Law. This DPA shall be governed by the laws of Switzerland.

12.2 Jurisdiction. Any disputes arising under this DPA shall be subject to the exclusive jurisdiction of the courts of Zurich, Switzerland.

12.3 Severability. If any provision is held invalid, the parties shall negotiate a valid replacement provision that achieves the intended purpose.

12.4 Entire Agreement. This DPA, together with the Principal Agreement, constitutes the entire agreement regarding data processing.

12.5 Amendment. This DPA may only be amended in writing signed by both Parties.

IN WITNESS WHEREOF, the Parties have executed this DPA as of the Effective Date.

NORDSTROM HEALTH AG

By: _________________________
Name: Dr. Ingrid Larsson
Title: Data Protection Officer
Date: February 1, 2025

EUROTECH SOLUTIONS GMBH

By: _________________________
Name: Klaus Weber
Title: Chief Technology Officer
Date: February 1, 2025`,
};

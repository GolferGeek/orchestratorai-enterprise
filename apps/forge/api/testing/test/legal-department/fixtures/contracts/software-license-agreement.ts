/**
 * Fixture: Software License Agreement (SaaS)
 *
 * An enterprise SaaS license agreement with subscription terms,
 * data handling provisions, and SLA commitments. Contains clauses
 * that trigger IP, privacy, and compliance specialists.
 *
 * KNOWN RISKS:
 * - Section 3.3: Broad data usage rights (Licensor can use customer data for ML)  → HIGH
 * - Section 5.2: Automatic price increase (15% annually, no cap)                → MEDIUM
 * - Section 7.2: No data portability on termination                              → HIGH
 * - Section 8: No SLA credits, uptime "target" not "guarantee"                   → MEDIUM
 * - Section 10.2: Unilateral right to modify terms with 30-day notice            → HIGH
 *
 * KNOWN METADATA:
 * - Type: contract / license agreement / SaaS agreement
 * - Parties: NexGen Analytics Corp. (licensor), Meridian Health Partners (licensee)
 * - Effective Date: June 15, 2025
 * - Signatures: David Park (CTO, NexGen), Dr. Lisa Ramirez (CIO, Meridian)
 */

export const SOFTWARE_LICENSE_AGREEMENT = {
  filename: 'software-license-agreement.txt',
  mimeType: 'text/plain',
  documentType: 'contract',
  subType: 'license',

  parties: [
    { name: 'NexGen Analytics Corp.', type: 'corporation', state: 'Washington', role: 'licensor' },
    { name: 'Meridian Health Partners Inc.', type: 'corporation', state: 'Massachusetts', role: 'licensee' },
  ],

  dates: {
    effective: '2025-06-15',
    initialTerm: '3 years',
  },

  signers: [
    { name: 'David Park', title: 'Chief Technology Officer', party: 'NexGen Analytics Corp.' },
    { name: 'Dr. Lisa Ramirez', title: 'Chief Information Officer', party: 'Meridian Health Partners Inc.' },
  ],

  expectedSectionCount: 12,

  knownRisks: {
    broadDataUsage: { section: 3, expectedMinRisk: 'high' as const },
    autopriceIncrease: { section: 5, expectedMinRisk: 'medium' as const },
    noDataPortability: { section: 7, expectedMinRisk: 'high' as const },
    weakSLA: { section: 8, expectedMinRisk: 'medium' as const },
    unilateralModification: { section: 10, expectedMinRisk: 'high' as const },
  },

  text: `SOFTWARE LICENSE AND SUBSCRIPTION AGREEMENT

This Software License and Subscription Agreement ("Agreement") is entered into as of June 15, 2025 ("Effective Date"), by and between:

NexGen Analytics Corp., a Washington corporation with its principal offices at 500 Data Boulevard, Seattle, WA 98101 ("Licensor"), and

Meridian Health Partners Inc., a Massachusetts corporation with its principal offices at 75 Medical Campus Drive, Boston, MA 02115 ("Licensee").

RECITALS

WHEREAS, Licensor has developed a proprietary cloud-based analytics platform known as "NexGen Insights" (the "Software"); and

WHEREAS, Licensee desires to obtain a subscription license to use the Software for its internal healthcare analytics operations;

NOW, THEREFORE, the Parties agree as follows:

SECTION 1. DEFINITIONS

1.1 "Software" means the NexGen Insights cloud-based analytics platform, including all updates, patches, and new versions made generally available during the Subscription Term.

1.2 "Customer Data" means all data, records, files, and information uploaded, transmitted, or stored by Licensee or its Authorized Users in connection with the Software, including but not limited to patient records, clinical data, financial records, and operational data.

1.3 "Authorized Users" means Licensee's employees, contractors, and agents who are authorized by Licensee to access and use the Software, up to the number of user licenses specified in the applicable Order Form.

1.4 "Documentation" means the user manuals, technical specifications, API documentation, and other written materials provided by Licensor regarding the use of the Software.

1.5 "Order Form" means a written document executed by both Parties specifying the scope of the license, number of Authorized Users, subscription fees, and other commercial terms.

SECTION 2. LICENSE GRANT

2.1 Subject to the terms of this Agreement, Licensor grants to Licensee a non-exclusive, non-transferable, non-sublicensable right to access and use the Software during the Subscription Term solely for Licensee's internal healthcare analytics operations as specified in the applicable Order Form.

2.2 Licensee shall not: (a) copy, modify, or create derivative works of the Software; (b) reverse engineer, decompile, or disassemble the Software; (c) sublicense, sell, rent, or lease the Software to any third party; (d) use the Software to provide services to third parties (including healthcare providers outside Licensee's network); or (e) remove or alter any proprietary notices or labels on the Software.

2.3 Licensor retains all right, title, and interest in and to the Software, including all intellectual property rights therein. No rights are granted to Licensee except as expressly set forth in this Agreement.

SECTION 3. CUSTOMER DATA

3.1 As between the Parties, Licensee retains all right, title, and interest in and to the Customer Data. Licensee grants Licensor a non-exclusive license to use, process, and store Customer Data solely as necessary to provide the Software and related services.

3.2 Licensor shall implement and maintain industry-standard security measures to protect Customer Data, including encryption at rest and in transit, access controls, and audit logging, in compliance with HIPAA, HITECH, and applicable state healthcare data protection laws.

3.3 Licensee hereby grants Licensor an irrevocable, perpetual, royalty-free, worldwide license to use de-identified and aggregated Customer Data for the purposes of improving the Software, developing new features, training machine learning models, conducting research, generating benchmarking reports, and any other purpose Licensor deems commercially beneficial. Licensor shall have the right to retain and use such de-identified data even after termination of this Agreement.

3.4 Licensor shall comply with all applicable data protection and healthcare privacy laws, including HIPAA, HITECH, GDPR (where applicable), and state-specific healthcare data protection statutes.

SECTION 4. SUPPORT AND MAINTENANCE

4.1 Licensor shall provide Licensee with technical support during business hours (8:00 AM - 6:00 PM Pacific Time, Monday through Friday, excluding holidays) via email, phone, and online ticketing system.

4.2 Licensor shall make commercially reasonable efforts to provide updates, bug fixes, and security patches for the Software on a regular basis.

4.3 Licensee may purchase enhanced support packages, including 24/7 support, dedicated account management, and priority escalation, as specified in the applicable Order Form.

SECTION 5. FEES AND PAYMENT

5.1 Licensee shall pay the subscription fees specified in the applicable Order Form. Fees shall be invoiced annually in advance unless otherwise specified.

5.2 Licensor reserves the right to increase subscription fees by up to fifteen percent (15%) at each annual renewal, effective upon the commencement of the next Renewal Term. Licensor shall provide Licensee with written notice of any fee increase at least sixty (60) days prior to the renewal date.

5.3 All fees are exclusive of applicable taxes. Licensee shall be responsible for all sales, use, excise, and other taxes arising out of this Agreement.

5.4 Late payments shall accrue interest at the rate of one and one-half percent (1.5%) per month or the maximum rate permitted by law, whichever is less.

SECTION 6. REPRESENTATIONS AND WARRANTIES

6.1 Licensor represents and warrants that: (a) the Software will perform materially in accordance with the Documentation; (b) the Software will not contain any malware, viruses, or malicious code; (c) Licensor has all rights necessary to grant the licenses herein; and (d) the Software will comply with applicable healthcare data regulations, including HIPAA.

6.2 EXCEPT AS EXPRESSLY SET FORTH IN THIS SECTION, THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

SECTION 7. TERM AND TERMINATION

7.1 The initial subscription term shall be three (3) years from the Effective Date ("Initial Term"). Thereafter, the Agreement shall automatically renew for successive one (1) year periods ("Renewal Terms") unless either Party provides written notice of non-renewal at least ninety (90) days prior to the end of the then-current term.

7.2 Upon termination or expiration of this Agreement, Licensee's access to the Software shall cease immediately. Licensor shall have no obligation to export, migrate, or provide access to Customer Data following termination. Licensee shall be solely responsible for extracting its Customer Data prior to the termination date.

7.3 Either Party may terminate this Agreement immediately upon written notice if the other Party materially breaches this Agreement and fails to cure such breach within thirty (30) days after written notice.

SECTION 8. SERVICE LEVEL

8.1 Licensor targets a monthly uptime of ninety-nine and five-tenths percent (99.5%) for the Software, measured on a calendar month basis, excluding scheduled maintenance windows and Force Majeure events.

8.2 The uptime target set forth in Section 8.1 is a goal, not a guarantee. Licensor shall not be liable for any failure to achieve the uptime target, and no service level credits or refunds shall be available to Licensee.

8.3 Licensor shall provide reasonable advance notice of scheduled maintenance windows that may affect availability.

SECTION 9. INDEMNIFICATION

9.1 Licensor shall indemnify and hold harmless Licensee from any third-party claim that the Software infringes a valid patent, copyright, or trade secret, provided that Licensee promptly notifies Licensor of the claim, grants Licensor sole control of the defense, and cooperates as reasonably requested.

9.2 Licensee shall indemnify and hold harmless Licensor from any claim arising from: (a) Licensee's use of the Software in violation of this Agreement; (b) Customer Data uploaded by Licensee; or (c) Licensee's violation of applicable healthcare regulations.

SECTION 10. GENERAL PROVISIONS

10.1 Governing Law. This Agreement shall be governed by the laws of the State of Washington.

10.2 Modification. Licensor may modify the terms of this Agreement, including the Acceptable Use Policy and Privacy Policy, at any time by providing Licensee with thirty (30) days' written notice. Licensee's continued use of the Software after the modification effective date shall constitute acceptance of the modified terms.

10.3 Assignment. Neither Party may assign this Agreement without prior written consent, except in connection with a merger, acquisition, or sale of all or substantially all assets.

10.4 Entire Agreement. This Agreement, together with all Order Forms, constitutes the entire agreement between the Parties.

10.5 Notices. All notices shall be in writing and delivered to the addresses set forth above.

10.6 Severability. If any provision is held invalid, the remaining provisions shall continue in effect.

SECTION 11. LIMITATION OF LIABILITY

11.1 IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

11.2 LICENSOR'S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE FEES PAID BY LICENSEE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.

SECTION 12. COMPLIANCE

12.1 Both Parties shall comply with all applicable federal, state, and local laws and regulations, including but not limited to HIPAA, HITECH, the Anti-Kickback Statute, and the False Claims Act.

12.2 Licensor shall make available to Licensee, upon request, documentation of its HIPAA compliance program, including its most recent SOC 2 Type II audit report.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

NEXGEN ANALYTICS CORP.

By: _________________________
Name: David Park
Title: Chief Technology Officer
Date: June 15, 2025

MERIDIAN HEALTH PARTNERS INC.

By: _________________________
Name: Dr. Lisa Ramirez
Title: Chief Information Officer
Date: June 15, 2025`,
};

/**
 * Fixture: Master Service Agreement (MSA)
 *
 * A comprehensive MSA between a technology services provider and
 * a client company. Contains standard enterprise contract terms
 * with some intentionally aggressive clauses for risk testing.
 *
 * KNOWN RISKS:
 * - Section 5: Broad IP assignment of all "work product"          → HIGH
 * - Section 7: Asymmetric indemnification (Provider bears all)    → HIGH
 * - Section 8: Low liability cap ($5,000) for a large engagement  → MEDIUM
 * - Section 10: Auto-renewal with 180-day cancellation window     → MEDIUM
 * - Section 13: Broad non-compete (2 years, nationwide)           → HIGH
 *
 * KNOWN METADATA:
 * - Type: contract / MSA / master service agreement
 * - Parties: Pinnacle Systems Inc. (Delaware corp), CloudFirst Solutions LLC (Texas LLC)
 * - Effective Date: March 1, 2025
 * - Sections: 15 articles
 * - Signatures: Sarah Chen (CEO, Pinnacle), Michael Torres (COO, CloudFirst)
 */

export const MASTER_SERVICE_AGREEMENT = {
  filename: 'master-service-agreement.txt',
  mimeType: 'text/plain',
  documentType: 'contract',
  subType: 'msa',

  parties: [
    { name: 'Pinnacle Systems Inc.', type: 'corporation', state: 'Delaware', role: 'client' },
    { name: 'CloudFirst Solutions LLC', type: 'llc', state: 'Texas', role: 'provider' },
  ],

  dates: {
    effective: '2025-03-01',
    initialTerm: '3 years',
  },

  signers: [
    { name: 'Sarah Chen', title: 'Chief Executive Officer', party: 'Pinnacle Systems Inc.' },
    { name: 'Michael Torres', title: 'Chief Operating Officer', party: 'CloudFirst Solutions LLC' },
  ],

  expectedSectionCount: 15,

  knownRisks: {
    ipAssignment: { section: 5, expectedMinRisk: 'high' as const },
    asymmetricIndemnification: { section: 7, expectedMinRisk: 'high' as const },
    lowLiabilityCap: { section: 8, expectedMinRisk: 'medium' as const },
    autoRenewal: { section: 10, expectedMinRisk: 'medium' as const },
    broadNonCompete: { section: 13, expectedMinRisk: 'high' as const },
  },

  text: `MASTER SERVICE AGREEMENT

This Master Service Agreement ("Agreement" or "MSA") is entered into as of March 1, 2025 ("Effective Date"), by and between:

Pinnacle Systems Inc., a Delaware corporation with its principal place of business at 200 Corporate Center Drive, Suite 500, Dallas, TX 75201 ("Client"), and

CloudFirst Solutions LLC, a Texas limited liability company with its principal place of business at 1800 Innovation Parkway, Austin, TX 78701 ("Provider").

Client and Provider are each referred to herein as a "Party" and collectively as the "Parties."

RECITALS

WHEREAS, Client desires to engage Provider to perform certain technology consulting, software development, and managed services as described in one or more Statements of Work to be executed hereunder; and

WHEREAS, Provider has the expertise, personnel, and resources to perform such services;

NOW, THEREFORE, in consideration of the mutual promises and covenants contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

SECTION 1. DEFINITIONS

1.1 "Services" means the technology consulting, software development, systems integration, managed services, and related professional services to be performed by Provider as described in each applicable Statement of Work.

1.2 "Statement of Work" or "SOW" means a written document executed by both Parties that describes the specific Services to be performed, deliverables, timelines, fees, and other terms applicable to a particular engagement.

1.3 "Deliverables" means all tangible and intangible work product, including but not limited to software code, documentation, reports, designs, architectures, and data, produced by Provider in the performance of Services.

1.4 "Confidential Information" means any non-public information disclosed by either Party to the other, whether orally, in writing, or electronically, including but not limited to business plans, technical data, financial information, customer data, and trade secrets.

1.5 "Personnel" means the employees, contractors, subcontractors, and agents of Provider engaged in performing Services.

SECTION 2. SERVICES AND STATEMENTS OF WORK

2.1 Provider shall perform Services as specified in each SOW executed by both Parties. Each SOW shall be subject to and governed by the terms of this Agreement.

2.2 In the event of a conflict between this Agreement and any SOW, the terms of this Agreement shall prevail unless the SOW expressly states that a specific provision overrides this Agreement with reference to the section being overridden.

2.3 Provider shall assign qualified Personnel with appropriate skills and experience to perform the Services. Client shall have the right to request replacement of any Personnel who are not performing satisfactorily, and Provider shall use commercially reasonable efforts to accommodate such requests.

SECTION 3. COMPENSATION AND PAYMENT

3.1 Client shall pay Provider the fees set forth in each applicable SOW. Unless otherwise specified, fees shall be invoiced monthly in arrears.

3.2 Payment shall be due within thirty (30) days of receipt of a proper invoice. Late payments shall bear interest at the lesser of one and one-half percent (1.5%) per month or the maximum rate permitted by law.

3.3 Client shall reimburse Provider for reasonable, pre-approved travel and out-of-pocket expenses incurred in connection with the Services, provided such expenses are documented with receipts.

3.4 Either Party may dispute an invoice in good faith by providing written notice within fifteen (15) days of receipt. Undisputed amounts shall remain due per the original payment terms.

SECTION 4. CONFIDENTIALITY

4.1 Each Party agrees to hold the other Party's Confidential Information in strict confidence and to use it solely for the purposes of this Agreement. Neither Party shall disclose the other's Confidential Information to any third party without prior written consent, except to its employees, contractors, and advisors who have a need to know and are bound by confidentiality obligations no less restrictive than those contained herein.

4.2 The obligations of confidentiality shall not apply to information that: (a) is or becomes publicly available through no fault of the receiving party; (b) was known to the receiving party prior to disclosure; (c) is independently developed without reference to the disclosing party's Confidential Information; or (d) is required to be disclosed by law, regulation, or court order, provided the receiving party gives prompt notice to allow the disclosing party to seek a protective order.

4.3 The obligations of confidentiality shall survive termination of this Agreement for a period of three (3) years.

SECTION 5. INTELLECTUAL PROPERTY RIGHTS

5.1 All Deliverables, work product, inventions, discoveries, improvements, software, code, documentation, and other materials created, conceived, or developed by Provider or its Personnel in the performance of Services under this Agreement (collectively, "Work Product") shall be the sole and exclusive property of Client. Provider hereby assigns, and shall cause its Personnel to assign, to Client all right, title, and interest in and to all Work Product, including all intellectual property rights therein.

5.2 Provider shall retain no right to use, license, distribute, or create derivative works from the Work Product for any purpose, including for other clients, internal development, or portfolio demonstrations, without the prior written consent of Client.

5.3 Provider represents and warrants that the Work Product will be original and will not infringe upon the intellectual property rights of any third party. Provider shall not incorporate any open-source software, third-party components, or pre-existing materials into the Work Product without Client's prior written approval.

5.4 Provider's pre-existing intellectual property ("Provider Background IP") used in the Services shall remain the property of Provider, provided that Provider grants Client a perpetual, irrevocable, royalty-free, worldwide license to use, modify, and distribute Provider Background IP solely as embedded in or necessary to use the Deliverables.

SECTION 6. REPRESENTATIONS AND WARRANTIES

6.1 Provider represents and warrants that: (a) the Services will be performed in a professional and workmanlike manner in accordance with industry standards; (b) Provider has the right and authority to enter into this Agreement; (c) Provider's performance will not violate any agreement with any third party; (d) all Personnel assigned to perform Services will have the qualifications and experience described in the applicable SOW; and (e) Provider will comply with all applicable laws and regulations in the performance of Services.

6.2 Client represents and warrants that: (a) it has the right and authority to enter into this Agreement; (b) it will provide reasonable cooperation and access as necessary for Provider to perform the Services; and (c) it will comply with all applicable laws and regulations.

6.3 EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, NEITHER PARTY MAKES ANY WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

SECTION 7. INDEMNIFICATION

7.1 Provider shall indemnify, defend, and hold harmless Client and its officers, directors, employees, agents, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees and court costs) arising out of or relating to: (a) any breach of Provider's representations, warranties, or obligations under this Agreement; (b) any negligent or willful act or omission by Provider or its Personnel; (c) any claim that the Deliverables or Services infringe upon the intellectual property rights of a third party; (d) any personal injury or property damage caused by Provider or its Personnel; or (e) any violation of applicable law by Provider or its Personnel.

7.2 Client's sole obligation to indemnify Provider shall be limited to claims arising directly from Client's breach of Section 4 (Confidentiality) of this Agreement.

SECTION 8. LIMITATION OF LIABILITY

8.1 IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, LOSS OF DATA, BUSINESS INTERRUPTION, OR LOSS OF GOODWILL, REGARDLESS OF THE CAUSE OF ACTION OR THE THEORY OF LIABILITY.

8.2 PROVIDER'S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED FIVE THOUSAND DOLLARS ($5,000.00) OR THE TOTAL FEES PAID UNDER THE APPLICABLE SOW IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, WHICHEVER IS LESS.

8.3 The limitations of liability set forth in this Section 8 shall not apply to: (a) Provider's indemnification obligations under Section 7; (b) Provider's breach of Section 4 (Confidentiality); or (c) claims arising from Provider's gross negligence or willful misconduct.

SECTION 9. INSURANCE

9.1 Provider shall maintain the following insurance coverage during the term of this Agreement: (a) Commercial General Liability insurance with limits of not less than $2,000,000 per occurrence and $5,000,000 in the aggregate; (b) Professional Liability (Errors & Omissions) insurance with limits of not less than $3,000,000 per claim; (c) Workers' Compensation insurance as required by applicable law; and (d) Cyber Liability insurance with limits of not less than $2,000,000 per claim.

9.2 Provider shall name Client as an additional insured on its Commercial General Liability policy and shall provide Client with certificates of insurance upon request.

SECTION 10. TERM AND TERMINATION

10.1 This Agreement shall commence on the Effective Date and shall continue for an initial term of three (3) years ("Initial Term").

10.2 Following the Initial Term, this Agreement shall automatically renew for successive one (1) year periods ("Renewal Terms") unless either Party provides written notice of non-renewal at least one hundred eighty (180) days prior to the end of the then-current term.

10.3 Either Party may terminate this Agreement immediately upon written notice if the other Party: (a) materially breaches this Agreement and fails to cure such breach within thirty (30) days after receipt of written notice; (b) becomes insolvent, files for bankruptcy, or has a receiver appointed for its assets; or (c) assigns this Agreement in violation of Section 15.

10.4 Upon termination, Provider shall: (a) cease all Services; (b) deliver all completed and in-progress Work Product to Client; (c) return or destroy all Confidential Information; and (d) invoice Client for all Services performed and expenses incurred through the termination date.

SECTION 11. DISPUTE RESOLUTION

11.1 The Parties shall first attempt to resolve any dispute arising under this Agreement through good faith negotiations between senior executives.

11.2 If the dispute is not resolved within thirty (30) days, either Party may submit the dispute to mediation administered by the American Arbitration Association. The costs of mediation shall be shared equally.

11.3 If mediation fails to resolve the dispute within sixty (60) days, either Party may pursue binding arbitration under the Commercial Arbitration Rules of the American Arbitration Association, to be conducted in Dallas, Texas.

SECTION 12. DATA PROTECTION AND SECURITY

12.1 Provider shall implement and maintain appropriate technical and organizational security measures to protect Client data against unauthorized access, loss, destruction, or alteration, consistent with industry standards and applicable data protection laws.

12.2 If Provider processes personal data on behalf of Client, the Parties shall execute a Data Processing Addendum that complies with the GDPR, CCPA, and other applicable data protection regulations.

12.3 Provider shall promptly notify Client (within forty-eight (48) hours) of any actual or suspected data breach affecting Client data and shall cooperate with Client in investigating and remediating such breach.

SECTION 13. NON-SOLICITATION AND NON-COMPETITION

13.1 During the term of this Agreement and for a period of twenty-four (24) months following termination, Provider shall not, directly or indirectly, solicit, recruit, or hire any employee of Client who was involved in or had knowledge of the Services performed under this Agreement.

13.2 During the term of this Agreement and for a period of twenty-four (24) months following termination, Provider shall not, directly or indirectly, perform services that are substantially similar to the Services for any direct competitor of Client in the United States, as identified in Exhibit A attached hereto.

13.3 Provider acknowledges that the restrictions in this Section 13 are reasonable and necessary to protect Client's legitimate business interests, including its Confidential Information, customer relationships, and competitive advantage.

SECTION 14. FORCE MAJEURE

14.1 Neither Party shall be liable for any failure or delay in performance due to causes beyond its reasonable control, including but not limited to acts of God, natural disasters, epidemics, pandemics, war, terrorism, government actions, labor disputes, power failures, or internet outages ("Force Majeure Event").

14.2 The affected Party shall provide prompt notice of the Force Majeure Event and shall use commercially reasonable efforts to mitigate its effects and resume performance.

SECTION 15. GENERAL PROVISIONS

15.1 Entire Agreement. This Agreement, together with all SOWs executed hereunder, constitutes the entire agreement between the Parties with respect to the subject matter hereof.

15.2 Amendment. This Agreement may not be amended except by a written instrument signed by authorized representatives of both Parties.

15.3 Assignment. Neither Party may assign this Agreement without the prior written consent of the other Party, except that either Party may assign this Agreement in connection with a merger, acquisition, or sale of substantially all of its assets.

15.4 Governing Law. This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of laws principles.

15.5 Severability. If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall continue in full force and effect.

15.6 Notices. All notices required or permitted under this Agreement shall be in writing and shall be deemed given when delivered personally, sent by certified mail (return receipt requested), or sent by nationally recognized overnight courier.

15.7 Waiver. The failure of either Party to enforce any provision of this Agreement shall not constitute a waiver of such provision or the right to enforce it at a later time.

15.8 Counterparts. This Agreement may be executed in counterparts, each of which shall be deemed an original, and all of which together shall constitute one and the same instrument.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

PINNACLE SYSTEMS INC.

By: _________________________
Name: Sarah Chen
Title: Chief Executive Officer
Date: March 1, 2025

CLOUDFIRST SOLUTIONS LLC

By: _________________________
Name: Michael Torres
Title: Chief Operating Officer
Date: March 1, 2025`,
};

/**
 * Fixture: Mutual Non-Disclosure Agreement
 *
 * A mutual NDA between two companies with intentionally problematic
 * clauses for risk calibration testing. Used by both document-onboarding
 * (metadata extraction) and contract-review (clause-level analysis).
 *
 * KNOWN RISKS (for contract-review calibration):
 * - Article 3: One-sided indemnification (Widget only)         → HIGH
 * - Article 5: Overly broad IP assignment (all Widget IP)      → HIGH
 * - Article 7: Unlimited liability for Widget, $100 cap Acme   → CRITICAL
 * - Article 9: Unilateral termination rights                   → MEDIUM
 * - Article 11: Mandatory arbitration + class action waiver    → MEDIUM
 *
 * KNOWN METADATA (for document-onboarding extraction):
 * - Type: contract / NDA / non-disclosure agreement
 * - Parties: Acme Corporation (Delaware corp), Widget Technologies LLC (CA LLC)
 * - Effective Date: January 15, 2025
 * - Sections: 12 articles + preamble + recitals + signatures
 * - Signatures: Jane Smith (CEO, Acme), John Doe (MD, Widget)
 * - Defined Terms: Confidential Information, Disclosing Party, Receiving Party, Purpose, etc.
 */

export const MUTUAL_NDA = {
  filename: 'mutual-nda.txt',
  mimeType: 'text/plain',
  documentType: 'contract',
  subType: 'nda',

  parties: [
    { name: 'Acme Corporation', type: 'corporation', state: 'Delaware', role: 'disclosing/receiving' },
    { name: 'Widget Technologies LLC', type: 'llc', state: 'California', role: 'disclosing/receiving' },
  ],

  dates: {
    effective: '2025-01-15',
  },

  signers: [
    { name: 'Jane Smith', title: 'Chief Executive Officer', party: 'Acme Corporation' },
    { name: 'John Doe', title: 'Managing Director', party: 'Widget Technologies LLC' },
  ],

  expectedSectionCount: 12,
  expectedDefinedTerms: ['Confidential Information', 'Disclosing Party', 'Receiving Party', 'Purpose'],

  knownRisks: {
    indemnification: { article: 3, expectedMinRisk: 'high' as const },
    ipAssignment: { article: 5, expectedMinRisk: 'high' as const },
    unlimitedLiability: { article: 7, expectedMinRisk: 'critical' as const },
    unilateralTermination: { article: 9, expectedMinRisk: 'medium' as const },
    classActionWaiver: { article: 11, expectedMinRisk: 'medium' as const },
  },

  text: `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of January 15, 2025 ("Effective Date"), by and between:

Acme Corporation, a Delaware corporation with its principal offices at 123 Innovation Drive, San Francisco, CA 94105 ("Acme"), and

Widget Technologies LLC, a California limited liability company with its principal offices at 456 Tech Boulevard, Palo Alto, CA 94301 ("Widget").

Acme and Widget are each referred to herein as a "Party" and collectively as the "Parties."

RECITALS

WHEREAS, the Parties wish to explore a potential business relationship relating to enterprise software integration (the "Purpose"); and

WHEREAS, in connection with such exploration, each Party may disclose certain confidential and proprietary information to the other Party.

NOW, THEREFORE, in consideration of the mutual covenants and agreements herein, the Parties agree as follows:

ARTICLE 1. DEFINITIONS

1.1 "Confidential Information" means any and all non-public, proprietary, or confidential information disclosed by either Party (the "Disclosing Party") to the other Party (the "Receiving Party"), whether orally, in writing, electronically, or by any other means, including but not limited to: (a) trade secrets, inventions, ideas, processes, formulas, source code, object code, algorithms, and data; (b) business plans, financial information, customer lists, and marketing strategies; (c) technical specifications, designs, drawings, and prototypes; and (d) any other information designated as "Confidential" or that would reasonably be understood to be confidential given the nature of the information and the circumstances of disclosure.

1.2 "Confidential Information" shall not include information that: (a) is or becomes publicly available through no fault of the Receiving Party; (b) was already known to the Receiving Party without restriction prior to disclosure; (c) is independently developed by the Receiving Party without use of or reference to the Disclosing Party's Confidential Information; or (d) is rightfully received from a third party without restriction.

ARTICLE 2. OBLIGATIONS OF CONFIDENTIALITY

2.1 The Receiving Party shall hold and maintain the Confidential Information of the Disclosing Party in strict confidence using at least the same degree of care as it uses to protect its own confidential information, but in no event less than reasonable care.

2.2 The Receiving Party shall not, without the prior written consent of the Disclosing Party, disclose Confidential Information to any third party except to its employees, officers, directors, consultants, and advisors who have a need to know and who are bound by obligations of confidentiality at least as restrictive as those set forth herein.

2.3 The Receiving Party shall use the Confidential Information solely for the Purpose and shall not use such information for any other purpose, including for its own benefit or the benefit of any third party.

ARTICLE 3. INDEMNIFICATION

3.1 Widget shall indemnify, defend, and hold harmless Acme and its officers, directors, employees, agents, successors, and assigns from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or relating to: (a) any breach of this Agreement by Widget; (b) any unauthorized use or disclosure of Acme's Confidential Information; (c) any third-party claims arising from Widget's use of the Confidential Information; and (d) any negligent or willful misconduct by Widget in connection with this Agreement.

3.2 Acme shall have no reciprocal indemnification obligation to Widget under this Agreement.

ARTICLE 4. NON-SOLICITATION

4.1 During the term of this Agreement and for a period of twenty-four (24) months following its termination or expiration, neither Party shall directly or indirectly solicit, recruit, hire, or engage any employee, contractor, or consultant of the other Party who was involved in the activities contemplated by this Agreement, without the prior written consent of the other Party.

ARTICLE 5. INTELLECTUAL PROPERTY

5.1 Any and all intellectual property, inventions, discoveries, improvements, works of authorship, trade secrets, and other proprietary rights conceived, created, developed, or reduced to practice by Widget during the term of this Agreement, whether or not related to the Purpose, shall be the sole and exclusive property of Acme. Widget hereby irrevocably assigns to Acme all right, title, and interest in and to such intellectual property.

5.2 Widget agrees to execute any documents and take any actions reasonably requested by Acme to perfect, protect, and enforce Acme's rights in such intellectual property.

ARTICLE 6. DATA PROTECTION

6.1 Each Party shall comply with all applicable data protection and privacy laws, including but not limited to the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), and any other applicable federal, state, or international data protection legislation.

6.2 In the event that either Party processes personal data on behalf of the other Party, the Parties shall enter into a separate data processing agreement that complies with applicable data protection laws.

6.3 Each Party shall implement appropriate technical and organizational measures to protect personal data against unauthorized access, loss, destruction, or alteration.

ARTICLE 7. LIMITATION OF LIABILITY

7.1 WIDGET'S TOTAL LIABILITY UNDER THIS AGREEMENT SHALL NOT BE LIMITED AND SHALL INCLUDE ALL DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, AND PUNITIVE DAMAGES, REGARDLESS OF THE FORM OF ACTION OR THEORY OF LIABILITY, INCLUDING BUT NOT LIMITED TO LOST PROFITS, LOSS OF BUSINESS, AND LOSS OF DATA.

7.2 ACME'S TOTAL LIABILITY UNDER THIS AGREEMENT SHALL BE LIMITED TO THE AMOUNT OF ONE HUNDRED DOLLARS ($100.00).

ARTICLE 8. REPRESENTATIONS AND WARRANTIES

8.1 Each Party represents and warrants that: (a) it has the full right, power, and authority to enter into this Agreement and to perform its obligations hereunder; (b) the execution and performance of this Agreement does not conflict with any other agreement to which it is a party; and (c) it will comply with all applicable laws and regulations in connection with its performance under this Agreement.

ARTICLE 9. TERM AND TERMINATION

9.1 This Agreement shall become effective on the Effective Date and shall continue in effect for a period of three (3) years unless earlier terminated in accordance with this Article.

9.2 Acme may terminate this Agreement at any time, for any reason or no reason, upon written notice to Widget. Widget may terminate this Agreement only upon ninety (90) days' prior written notice and only for material breach by Acme that remains uncured after such notice period.

9.3 The obligations of confidentiality set forth in Article 2 shall survive termination or expiration of this Agreement for a period of five (5) years.

ARTICLE 10. RETURN OF MATERIALS

10.1 Upon termination or expiration of this Agreement, or upon request by the Disclosing Party, the Receiving Party shall promptly return or destroy all Confidential Information in its possession, including all copies, notes, summaries, and analyses thereof, and shall certify in writing that it has done so.

ARTICLE 11. DISPUTE RESOLUTION

11.1 Any dispute, controversy, or claim arising out of or relating to this Agreement shall be resolved exclusively through binding arbitration administered by the American Arbitration Association in accordance with its Commercial Arbitration Rules, conducted in San Francisco, California.

11.2 THE PARTIES HEREBY WAIVE ANY RIGHT TO A JURY TRIAL AND ANY RIGHT TO PARTICIPATE IN A CLASS ACTION, CLASS-WIDE ARBITRATION, OR CONSOLIDATED ARBITRATION IN CONNECTION WITH ANY DISPUTE ARISING UNDER THIS AGREEMENT.

11.3 The arbitrator's decision shall be final and binding, and judgment upon the award may be entered in any court of competent jurisdiction.

ARTICLE 12. GENERAL PROVISIONS

12.1 Entire Agreement. This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior and contemporaneous agreements, understandings, and representations.

12.2 Amendment. This Agreement may not be amended or modified except by a written instrument signed by both Parties.

12.3 Governing Law. This Agreement shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflicts of law principles.

12.4 Severability. If any provision of this Agreement is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.

12.5 Assignment. Neither Party may assign this Agreement without the prior written consent of the other Party.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

ACME CORPORATION

By: _________________________
Name: Jane Smith
Title: Chief Executive Officer

WIDGET TECHNOLOGIES LLC

By: _________________________
Name: John Doe
Title: Managing Director`,
};

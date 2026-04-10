/**
 * Fixture: Employment Agreement with Restrictive Covenants
 *
 * An executive employment agreement with non-compete, non-solicitation,
 * IP assignment, and confidentiality provisions. Triggers the employment,
 * IP, and privacy specialists.
 *
 * KNOWN RISKS:
 * - Section 5: Overly broad non-compete (3 years, worldwide)          → HIGH
 * - Section 6: Non-solicitation extends to clients employee never met → MEDIUM
 * - Section 7: IP assignment covers pre-employment inventions         → HIGH
 * - Section 8: At-will termination with no severance for cause        → MEDIUM
 * - Section 10: Mandatory arbitration, employee pays own fees         → HIGH
 *
 * KNOWN METADATA:
 * - Type: employment / employment agreement
 * - Parties: Vertex Dynamics Inc. (employer), Dr. James Wilson (employee)
 * - Effective Date: April 1, 2025
 * - Signatures: Catherine O'Brien (CHRO), Dr. James Wilson
 */

export const EMPLOYMENT_AGREEMENT = {
  filename: 'employment-agreement.txt',
  mimeType: 'text/plain',
  documentType: 'employment',
  subType: 'employment-agreement',

  parties: [
    { name: 'Vertex Dynamics Inc.', type: 'corporation', state: 'Massachusetts', role: 'employer' },
    { name: 'Dr. James Wilson', type: 'individual', role: 'employee' },
  ],

  dates: {
    effective: '2025-04-01',
  },

  signers: [
    { name: "Catherine O'Brien", title: 'Chief Human Resources Officer', party: 'Vertex Dynamics Inc.' },
    { name: 'Dr. James Wilson', title: 'Vice President of Engineering', party: 'Employee' },
  ],

  expectedSectionCount: 12,

  knownRisks: {
    broadNonCompete: { section: 5, expectedMinRisk: 'high' as const },
    broadNonSolicitation: { section: 6, expectedMinRisk: 'medium' as const },
    preEmploymentIP: { section: 7, expectedMinRisk: 'high' as const },
    noSeverance: { section: 8, expectedMinRisk: 'medium' as const },
    arbitrationCosts: { section: 10, expectedMinRisk: 'high' as const },
  },

  text: `EMPLOYMENT AGREEMENT

This Employment Agreement ("Agreement") is entered into as of April 1, 2025 ("Effective Date"), by and between:

Vertex Dynamics Inc., a Massachusetts corporation with its principal offices at 100 Cambridge Park Drive, Cambridge, MA 02140 ("Company" or "Employer"), and

Dr. James Wilson, an individual residing at 45 Beacon Street, Unit 12, Boston, MA 02108 ("Employee").

SECTION 1. POSITION AND DUTIES

1.1 Company hereby employs Employee as Vice President of Engineering, reporting to the Chief Technology Officer. Employee shall perform such duties and responsibilities as are customary for such position and as may be assigned by the Company from time to time.

1.2 Employee shall devote substantially all of Employee's business time, attention, and efforts to the performance of Employee's duties under this Agreement. Employee shall not engage in any other employment or business activity without the prior written consent of the Company, except for service on nonprofit boards, passive personal investments, and academic activities that do not interfere with Employee's obligations hereunder.

1.3 Employee's principal place of work shall be the Company's Cambridge, Massachusetts offices, with travel as reasonably required.

SECTION 2. COMPENSATION

2.1 Base Salary. Company shall pay Employee an annual base salary of Three Hundred Fifty Thousand Dollars ($350,000.00), payable in accordance with the Company's regular payroll schedule, less applicable withholdings and deductions.

2.2 Annual Bonus. Employee shall be eligible for an annual performance bonus of up to forty percent (40%) of base salary, based on the achievement of individual and company performance objectives established by the Board of Directors.

2.3 Equity. Employee shall be granted an option to purchase 100,000 shares of the Company's common stock, subject to the terms of the Company's Stock Option Plan and a separate Stock Option Agreement. The options shall vest over four (4) years with a one (1) year cliff.

2.4 Benefits. Employee shall be eligible to participate in the Company's standard benefits programs, including health insurance, dental insurance, vision insurance, 401(k) plan, and paid time off, in accordance with the terms of such programs as in effect from time to time.

SECTION 3. CONFIDENTIAL INFORMATION

3.1 Employee acknowledges that in the course of employment, Employee will have access to and may develop Confidential Information. "Confidential Information" means all non-public information relating to the Company's business, including trade secrets, inventions, algorithms, source code, technical data, product plans, customer lists, business strategies, financial information, and personnel data.

3.2 Employee shall hold all Confidential Information in strict confidence and shall not disclose or use any Confidential Information, either during or after employment, except as necessary to perform Employee's duties.

3.3 Upon termination of employment, Employee shall immediately return all documents, files, materials, devices, and copies containing or relating to Confidential Information.

SECTION 4. WORK PRODUCT

4.1 All inventions, discoveries, improvements, software, algorithms, designs, works of authorship, and other intellectual property conceived, created, or developed by Employee, either alone or jointly with others, during the term of employment and related to the Company's business or resulting from Company resources (collectively, "Work Product") shall be the sole and exclusive property of the Company.

4.2 Employee hereby irrevocably assigns to the Company all right, title, and interest in and to all Work Product, including all patent, copyright, trade secret, and other intellectual property rights therein.

SECTION 5. NON-COMPETITION

5.1 During the term of employment and for a period of thirty-six (36) months following the termination of employment for any reason (the "Restricted Period"), Employee shall not, directly or indirectly, anywhere in the world:

(a) Engage in, own, manage, operate, control, or participate in any business that develops, manufactures, markets, or sells products or services that are competitive with any products or services offered by the Company at the time of termination or that were in active development during the twelve (12) months preceding termination;

(b) Serve as an officer, director, employee, consultant, advisor, or agent of any Competitor (as defined below); or

(c) Have any equity or financial interest in any Competitor, except for passive ownership of less than one percent (1%) of publicly traded securities.

5.2 "Competitor" means any person, firm, corporation, or other entity that engages in the development, manufacture, marketing, or sale of robotics, autonomous systems, artificial intelligence, or machine learning products or services.

SECTION 6. NON-SOLICITATION

6.1 During the Restricted Period, Employee shall not, directly or indirectly:

(a) Solicit, recruit, hire, or engage, or attempt to solicit, recruit, hire, or engage, any employee, contractor, or consultant of the Company, or induce or encourage any such person to leave the Company's employ;

(b) Solicit, contact, or transact business with, or attempt to solicit, contact, or transact business with, any client, customer, vendor, supplier, or business partner of the Company for the purpose of providing products or services competitive with the Company, regardless of whether Employee had personal contact with such party during employment.

SECTION 7. INTELLECTUAL PROPERTY ASSIGNMENT

7.1 Employee assigns to the Company all right, title, and interest in and to any and all inventions, discoveries, improvements, trade secrets, and other intellectual property that Employee has conceived, created, developed, or reduced to practice prior to the Effective Date of this Agreement and that relate to the Company's current or anticipated business, research, or development activities ("Pre-Existing IP"). A list of Pre-Existing IP is set forth in Exhibit A.

7.2 If Employee fails to provide Exhibit A within ten (10) business days of the Effective Date, it shall be conclusively presumed that Employee has no Pre-Existing IP, and any subsequent claim by Employee of prior invention shall be deemed waived.

7.3 Employee agrees to execute all documents and take all actions necessary to vest in the Company full ownership of all Pre-Existing IP and Work Product.

SECTION 8. TERMINATION

8.1 At-Will Employment. Employee's employment is at-will and may be terminated by either party at any time, with or without cause, upon thirty (30) days' written notice.

8.2 Termination for Cause. The Company may terminate Employee's employment immediately for Cause, without notice or severance. "Cause" includes: (a) material breach of this Agreement; (b) conviction of a felony; (c) fraud, dishonesty, or misconduct; (d) willful failure to perform duties; (e) violation of Company policies; or (f) conduct that brings the Company into disrepute.

8.3 Termination Without Cause. If the Company terminates Employee's employment without Cause, Employee shall be entitled to: (a) continued payment of base salary for a period of six (6) months; and (b) continuation of health benefits for six (6) months, subject to Employee's execution of a general release of claims.

8.4 Resignation. Employee may resign at any time upon thirty (30) days' written notice. No severance shall be payable upon resignation.

SECTION 9. RETURN OF PROPERTY

9.1 Upon termination, Employee shall immediately return all Company property, including laptops, phones, access cards, documents, and Confidential Information.

SECTION 10. DISPUTE RESOLUTION

10.1 Any dispute arising under this Agreement shall be resolved through binding arbitration administered by JAMS in Boston, Massachusetts.

10.2 Each party shall bear its own attorneys' fees and costs in connection with any arbitration. The arbitrator's fees shall be split equally between the parties.

10.3 Employee hereby waives any right to a jury trial and any right to participate in a class action or collective action in connection with any dispute arising under this Agreement.

SECTION 11. REPRESENTATIONS

11.1 Employee represents that: (a) Employee is not subject to any non-compete, non-solicitation, or other restrictive covenant that would prevent Employee from performing duties hereunder; (b) Employee will not bring to the Company any confidential information or trade secrets of any former employer; and (c) Employee has disclosed all potential conflicts of interest.

SECTION 12. GENERAL PROVISIONS

12.1 Governing Law. This Agreement shall be governed by the laws of the Commonwealth of Massachusetts.

12.2 Entire Agreement. This Agreement constitutes the entire agreement between the parties regarding Employee's employment.

12.3 Severability. If any provision is held unenforceable, the court shall reform such provision to the minimum extent necessary to make it enforceable.

12.4 Amendment. This Agreement may not be amended except by written instrument signed by both parties.

12.5 Survival. Sections 3, 4, 5, 6, 7, and 10 shall survive termination of employment.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.

VERTEX DYNAMICS INC.

By: _________________________
Name: Catherine O'Brien
Title: Chief Human Resources Officer
Date: April 1, 2025

EMPLOYEE

_________________________
Dr. James Wilson
Date: April 1, 2025`,
};

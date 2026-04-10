/**
 * Fixture: Commercial Lease Agreement
 *
 * A commercial office lease with standard landlord-tenant terms.
 * Triggers the real_estate specialist. Contains provisions for
 * rent escalation, maintenance, and default remedies.
 *
 * KNOWN RISKS:
 * - Section 4: Annual rent escalation (5% compounding, no cap)     → MEDIUM
 * - Section 6: Tenant responsible for ALL maintenance and repairs  → HIGH
 * - Section 8: No right to cure for non-monetary default          → HIGH
 * - Section 9: Broad personal guarantee by Tenant's principal     → HIGH
 * - Section 11: Landlord can relocate Tenant to comparable space  → MEDIUM
 *
 * KNOWN METADATA:
 * - Type: lease / commercial lease
 * - Parties: Granite Properties Group LLC (landlord), Horizon Digital Agency Inc. (tenant)
 * - Effective Date: September 1, 2025
 * - Lease Term: 5 years
 * - Signatures: Robert Huang (Managing Partner, Granite), Aisha Johnson (CEO, Horizon)
 */

export const COMMERCIAL_LEASE = {
  filename: 'commercial-lease.txt',
  mimeType: 'text/plain',
  documentType: 'lease',
  subType: 'commercial-lease',

  parties: [
    { name: 'Granite Properties Group LLC', type: 'llc', state: 'New York', role: 'landlord' },
    { name: 'Horizon Digital Agency Inc.', type: 'corporation', state: 'New York', role: 'tenant' },
  ],

  dates: {
    effective: '2025-09-01',
    expiration: '2030-08-31',
    leaseTerm: '5 years',
  },

  signers: [
    { name: 'Robert Huang', title: 'Managing Partner', party: 'Granite Properties Group LLC' },
    { name: 'Aisha Johnson', title: 'Chief Executive Officer', party: 'Horizon Digital Agency Inc.' },
  ],

  expectedSectionCount: 14,

  knownRisks: {
    rentEscalation: { section: 4, expectedMinRisk: 'medium' as const },
    fullMaintenance: { section: 6, expectedMinRisk: 'high' as const },
    noCureRight: { section: 8, expectedMinRisk: 'high' as const },
    personalGuarantee: { section: 9, expectedMinRisk: 'high' as const },
    relocationRight: { section: 11, expectedMinRisk: 'medium' as const },
  },

  text: `COMMERCIAL LEASE AGREEMENT

This Commercial Lease Agreement ("Lease") is entered into as of September 1, 2025 ("Effective Date"), by and between:

Granite Properties Group LLC, a New York limited liability company with its principal offices at 350 Fifth Avenue, Suite 4200, New York, NY 10118 ("Landlord"), and

Horizon Digital Agency Inc., a New York corporation with its principal offices at 222 Broadway, Suite 1500, New York, NY 10038 ("Tenant").

SECTION 1. PREMISES

1.1 Landlord hereby leases to Tenant, and Tenant hereby leases from Landlord, the office space located at 350 Fifth Avenue, Suite 3100, New York, NY 10118, consisting of approximately 4,500 rentable square feet (the "Premises"), as more particularly described in Exhibit A attached hereto.

1.2 The Premises are located on the 31st floor of the building commonly known as "Granite Tower" (the "Building"). Tenant shall have non-exclusive access to common areas, elevators, lobbies, restrooms, and loading docks serving the Building.

SECTION 2. LEASE TERM

2.1 The initial term of this Lease shall commence on the Effective Date and shall expire on August 31, 2030, unless sooner terminated in accordance with this Lease (the "Lease Term").

2.2 Tenant shall have one (1) option to renew this Lease for an additional five (5) year term ("Renewal Term"), provided that: (a) Tenant is not in default at the time of exercise; (b) Tenant provides written notice of its intent to renew at least one hundred eighty (180) days prior to the expiration of the initial Lease Term; and (c) the base rent during the Renewal Term shall be the then-prevailing market rate, as determined by Landlord in its reasonable discretion.

SECTION 3. BASE RENT

3.1 Tenant shall pay Landlord an initial annual base rent of Two Hundred Twenty-Five Thousand Dollars ($225,000.00), payable in equal monthly installments of Eighteen Thousand Seven Hundred Fifty Dollars ($18,750.00) on the first day of each calendar month during the Lease Term.

3.2 Tenant shall pay a security deposit equal to three (3) months' base rent ($56,250.00) upon execution of this Lease. The security deposit shall be held by Landlord in a non-interest-bearing account and shall be returned to Tenant within sixty (60) days after the expiration or termination of this Lease, less any amounts applied to cure Tenant defaults.

SECTION 4. RENT ESCALATION

4.1 Commencing on the first anniversary of the Effective Date, and on each anniversary thereafter, the annual base rent shall increase by five percent (5%) over the base rent in effect during the immediately preceding year. There shall be no cap on cumulative rent increases during the Lease Term or any Renewal Term.

4.2 In addition to base rent, Tenant shall pay its proportionate share (based on the ratio of the Premises to the total rentable area of the Building) of increases in real property taxes and operating expenses over the base year (calendar year 2025).

SECTION 5. PERMITTED USE

5.1 Tenant shall use the Premises solely for general office purposes related to its digital marketing and advertising business.

5.2 Tenant shall not use the Premises for any illegal purpose, and shall comply with all applicable laws, ordinances, codes, and regulations.

5.3 Tenant shall not make any alterations, additions, or improvements to the Premises without the prior written consent of Landlord, which consent shall not be unreasonably withheld for non-structural alterations costing less than $25,000.

SECTION 6. MAINTENANCE AND REPAIRS

6.1 Tenant shall, at its sole cost and expense, keep and maintain the Premises and all fixtures, equipment, and systems serving the Premises (including HVAC, plumbing, electrical, and fire suppression systems) in good order, condition, and repair throughout the Lease Term.

6.2 Tenant shall be responsible for all repairs and replacements necessary to maintain the Premises, whether structural or non-structural, ordinary or extraordinary, foreseen or unforeseen, regardless of the cause of the need for such repair or replacement.

6.3 Landlord shall have no obligation to perform any maintenance, repairs, or replacements to the Premises or any systems serving the Premises. Landlord's sole obligation shall be to maintain the structural integrity of the Building's exterior walls, roof, and foundation, and the common areas of the Building.

SECTION 7. INSURANCE

7.1 Tenant shall maintain commercial general liability insurance with limits of not less than $2,000,000 per occurrence and $5,000,000 in the aggregate, naming Landlord as an additional insured.

7.2 Tenant shall maintain property insurance covering Tenant's personal property, fixtures, and improvements within the Premises.

7.3 Tenant shall maintain workers' compensation insurance as required by applicable law.

SECTION 8. DEFAULT AND REMEDIES

8.1 The following shall constitute events of default: (a) failure to pay rent within five (5) days after written notice; (b) failure to perform any non-monetary obligation under this Lease; (c) Tenant's bankruptcy, insolvency, or assignment for the benefit of creditors; (d) abandonment of the Premises; or (e) any material misrepresentation by Tenant.

8.2 For monetary defaults, Tenant shall have a five (5) day cure period after receipt of written notice from Landlord. For non-monetary defaults under subsection (b), Landlord may terminate this Lease immediately upon written notice without providing Tenant any opportunity to cure.

8.3 Upon the occurrence of an event of default, Landlord may, at its option: (a) terminate this Lease and recover all unpaid rent through the end of the Lease Term; (b) re-enter and take possession of the Premises without terminating this Lease; (c) pursue any other remedy available at law or in equity; or (d) accelerate all remaining rent payments for the balance of the Lease Term.

SECTION 9. PERSONAL GUARANTEE

9.1 As a material inducement to Landlord entering into this Lease, Aisha Johnson, individually ("Guarantor"), hereby unconditionally and irrevocably guarantees to Landlord the full and punctual payment and performance by Tenant of all obligations under this Lease, including but not limited to the payment of rent, additional rent, damages, and all other amounts due.

9.2 Guarantor's liability under this Section shall be primary and direct, and Landlord may proceed against Guarantor without first pursuing remedies against Tenant.

9.3 Guarantor waives all defenses of suretyship, including but not limited to notice of acceptance, notice of default, presentment, demand, and protest.

SECTION 10. ASSIGNMENT AND SUBLETTING

10.1 Tenant shall not assign this Lease or sublet the Premises or any portion thereof without the prior written consent of Landlord, which consent may be withheld in Landlord's sole and absolute discretion.

10.2 Any assignment or subletting consented to by Landlord shall not release Tenant from its obligations under this Lease.

SECTION 11. RELOCATION

11.1 Landlord reserves the right, at any time during the Lease Term, to relocate Tenant to comparable office space within the Building, provided that: (a) the replacement space is of approximately the same size and quality; (b) Landlord pays the reasonable costs of the physical relocation; and (c) Landlord provides Tenant with at least sixty (60) days' prior written notice.

11.2 Tenant's sole remedy for any dispute regarding the comparability of the replacement space shall be to terminate this Lease upon thirty (30) days' written notice.

SECTION 12. SURRENDER AND HOLDOVER

12.1 Upon expiration or termination of this Lease, Tenant shall surrender the Premises in good condition, reasonable wear and tear excepted, and shall remove all of Tenant's personal property.

12.2 If Tenant remains in possession after the Lease Term without Landlord's consent, Tenant shall be a holdover tenant at sufferance, and the monthly rent during any holdover period shall be two hundred percent (200%) of the then-current monthly base rent.

SECTION 13. MISCELLANEOUS

13.1 Governing Law. This Lease shall be governed by the laws of the State of New York.

13.2 Entire Agreement. This Lease constitutes the entire agreement between the Parties.

13.3 Notices. All notices shall be in writing and delivered to the addresses set forth above.

13.4 Severability. If any provision is held invalid, the remaining provisions shall remain in effect.

13.5 Waiver. No waiver of any provision shall be deemed a continuing waiver.

13.6 Broker. Each Party represents that it has not engaged any real estate broker in connection with this Lease except as set forth in Exhibit B.

SECTION 14. SUBORDINATION

14.1 This Lease shall be subordinate to any existing or future mortgage or deed of trust encumbering the Building, provided that Landlord obtains a subordination, non-disturbance, and attornment agreement from the mortgagee for Tenant's benefit.

IN WITNESS WHEREOF, the Parties have executed this Lease as of the Effective Date.

GRANITE PROPERTIES GROUP LLC

By: _________________________
Name: Robert Huang
Title: Managing Partner
Date: September 1, 2025

HORIZON DIGITAL AGENCY INC.

By: _________________________
Name: Aisha Johnson
Title: Chief Executive Officer
Date: September 1, 2025

GUARANTOR (Personal Guarantee — Section 9)

_________________________
Aisha Johnson, individually
Date: September 1, 2025`,
};

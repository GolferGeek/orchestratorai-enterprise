/**
 * Fixture: Federal Complaint — Breach of Contract
 *
 * A federal civil complaint filed in the Northern District of California.
 * Tests document-onboarding's classification, section detection, party
 * extraction, and date extraction for litigation documents.
 *
 * This is NOT a contract — it should NOT be sent through contract-review.
 * It validates that the CLO routing correctly identifies litigation
 * documents and routes to the litigation specialist.
 *
 * KNOWN METADATA:
 * - Type: pleading / complaint / court filing
 * - Parties: TechVenture Labs Inc. (plaintiff), DataStream Corp. (defendant)
 * - Filing Date: November 15, 2024
 * - Jurisdiction: U.S. District Court, Northern District of California
 * - Case No: 3:24-cv-08472-JSW
 * - Sections: Caption, Parties, Jurisdiction, Factual Allegations, Causes of Action, Prayer for Relief
 * - Signatures: Patricia Nguyen (attorney for plaintiff)
 */

export const COMPLAINT_BREACH_OF_CONTRACT = {
  filename: 'complaint-breach-of-contract.txt',
  mimeType: 'text/plain',
  documentType: 'pleading',
  subType: 'complaint',

  parties: [
    { name: 'TechVenture Labs Inc.', type: 'corporation', state: 'Delaware', role: 'plaintiff' },
    { name: 'DataStream Corp.', type: 'corporation', state: 'California', role: 'defendant' },
  ],

  dates: {
    filing: '2024-11-15',
    contractDate: '2023-06-01',
    breachDate: '2024-08-15',
  },

  signers: [
    { name: 'Patricia Nguyen', title: 'Attorney for Plaintiff', party: 'Morrison & Chen LLP' },
  ],

  expectedSections: ['caption', 'parties', 'jurisdiction', 'factual allegations', 'causes of action', 'prayer for relief'],

  text: `UNITED STATES DISTRICT COURT
NORTHERN DISTRICT OF CALIFORNIA
SAN FRANCISCO DIVISION

Case No. 3:24-cv-08472-JSW

TECHVENTURE LABS INC.,
a Delaware corporation,

                    Plaintiff,

        v.

DATASTREAM CORP.,
a California corporation,

                    Defendant.

COMPLAINT FOR DAMAGES AND INJUNCTIVE RELIEF

Plaintiff TechVenture Labs Inc. ("TechVenture" or "Plaintiff"), by and through its attorneys Morrison & Chen LLP, hereby files this Complaint against Defendant DataStream Corp. ("DataStream" or "Defendant"), and alleges as follows:

I. PARTIES

1. Plaintiff TechVenture Labs Inc. is a corporation organized under the laws of the State of Delaware, with its principal place of business at 800 Market Street, Suite 600, San Francisco, California 94102. TechVenture is engaged in the business of developing enterprise artificial intelligence and machine learning solutions.

2. Defendant DataStream Corp. is a corporation organized under the laws of the State of California, with its principal place of business at 1200 Embarcadero Road, Palo Alto, California 94301. DataStream provides cloud data infrastructure and streaming analytics services.

II. JURISDICTION AND VENUE

3. This Court has subject matter jurisdiction over this action pursuant to 28 U.S.C. § 1332(a) because there is complete diversity of citizenship between the parties and the amount in controversy exceeds $75,000, exclusive of interest and costs.

4. Plaintiff TechVenture is a citizen of the State of Delaware (its state of incorporation) and the State of California (its principal place of business). Defendant DataStream is a citizen of the State of California (its state of both incorporation and principal place of business).

5. Venue is proper in this judicial district pursuant to 28 U.S.C. § 1391(b)(2) because a substantial part of the events or omissions giving rise to the claims occurred in this district.

III. FACTUAL ALLEGATIONS

A. The Master Services Agreement

6. On or about June 1, 2023, TechVenture and DataStream entered into a Master Services Agreement ("MSA") pursuant to which DataStream agreed to provide cloud data infrastructure services, including real-time data streaming, data warehousing, and analytics platform hosting, to TechVenture (the "Services").

7. The MSA had an initial term of two (2) years, commencing on June 1, 2023, and expiring on May 31, 2025.

8. Under the MSA, DataStream guaranteed a monthly uptime of 99.95% for its data streaming services and agreed to provide service level credits for any downtime exceeding the guaranteed threshold.

9. The total annual contract value of the MSA was approximately $2.4 million, consisting of monthly fees of $200,000 for the bundled Services.

B. DataStream's Performance Failures

10. Beginning in approximately March 2024, TechVenture began experiencing significant and recurring service outages with DataStream's data streaming platform. These outages resulted in the loss of critical real-time data feeds that TechVenture's AI models relied upon for enterprise customer deployments.

11. Between March 2024 and August 2024, DataStream's services experienced no fewer than twenty-three (23) separate outage events, each lasting between four (4) hours and seventy-two (72) hours. The cumulative monthly uptime during this period averaged approximately 96.2%, far below the contractually guaranteed 99.95%.

12. On multiple occasions, TechVenture notified DataStream of the service failures and requested immediate remediation. DataStream acknowledged the issues but failed to implement effective corrective measures.

13. The service outages directly caused TechVenture to lose three (3) enterprise customers, representing approximately $4.8 million in annual recurring revenue, due to TechVenture's inability to deliver reliable AI-powered analytics to its customers.

C. DataStream's Material Breach

14. On or about August 15, 2024, DataStream notified TechVenture that it was discontinuing the data streaming product line used by TechVenture and migrating all customers to a new, incompatible platform. DataStream provided only thirty (30) days' notice of this change, in violation of the MSA's requirement of one hundred eighty (180) days' notice for material service changes.

15. The forced migration to the new platform required TechVenture to rewrite significant portions of its data ingestion infrastructure at a cost of approximately $1.2 million in engineering resources.

16. DataStream refused to provide the service level credits owed under the MSA for the documented downtime events, claiming that the credits were "not applicable during platform transitions."

D. Damages

17. As a direct and proximate result of DataStream's breaches, TechVenture has suffered damages including but not limited to: (a) lost revenue from departed customers ($4.8 million); (b) costs of re-engineering data infrastructure ($1.2 million); (c) service level credits owed but not paid ($480,000); (d) lost business opportunities and goodwill; and (e) costs of securing alternative data infrastructure services.

18. TechVenture's total damages exceed $7,000,000.

IV. CAUSES OF ACTION

COUNT I: BREACH OF CONTRACT

19. TechVenture incorporates by reference the allegations set forth in paragraphs 1 through 18 above.

20. The MSA constitutes a valid and enforceable contract between TechVenture and DataStream.

21. TechVenture performed all of its material obligations under the MSA, including timely payment of all fees due.

22. DataStream materially breached the MSA by: (a) failing to maintain the guaranteed 99.95% monthly uptime; (b) discontinuing the contracted services with inadequate notice; (c) failing to provide required service level credits; and (d) failing to implement reasonable corrective measures for recurring outages.

23. As a direct and proximate result of DataStream's breaches, TechVenture has suffered and continues to suffer damages in an amount to be proven at trial, but not less than $7,000,000.

COUNT II: BREACH OF THE IMPLIED COVENANT OF GOOD FAITH AND FAIR DEALING

24. TechVenture incorporates by reference the allegations set forth above.

25. The MSA contained an implied covenant of good faith and fair dealing that required DataStream to act fairly and in good faith in the performance of its obligations.

26. DataStream breached the implied covenant by: (a) refusing to acknowledge its service level obligations during the "platform transition" period; (b) forcing a migration to an incompatible platform without adequate notice or support; and (c) withholding service level credits it knew were owed.

27. DataStream's conduct deprived TechVenture of the benefits it reasonably expected under the MSA.

V. PRAYER FOR RELIEF

WHEREFORE, Plaintiff TechVenture Labs Inc. respectfully requests that this Court enter judgment in its favor and against Defendant DataStream Corp., and award the following relief:

A. Compensatory damages in an amount to be proven at trial, but not less than $7,000,000;

B. Consequential damages for lost business opportunities and goodwill;

C. Pre-judgment and post-judgment interest at the maximum rate allowed by law;

D. Reasonable attorneys' fees and costs of suit;

E. Injunctive relief requiring DataStream to continue providing the originally contracted services during the pendency of this action; and

F. Such other and further relief as this Court deems just and equitable.

JURY DEMAND

Plaintiff hereby demands a trial by jury on all issues so triable.

Dated: November 15, 2024

Respectfully submitted,

MORRISON & CHEN LLP

By: /s/ Patricia Nguyen
    Patricia Nguyen (SBN 298745)
    Morrison & Chen LLP
    555 California Street, Suite 3200
    San Francisco, CA 94104
    Telephone: (415) 555-0100
    Email: pnguyen@morrisonchen.com

    Attorneys for Plaintiff
    TechVenture Labs Inc.`,
};

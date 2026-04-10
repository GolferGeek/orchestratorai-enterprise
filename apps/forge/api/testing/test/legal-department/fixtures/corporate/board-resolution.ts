/**
 * Fixture: Board Resolution — Authorization of Acquisition
 *
 * A board resolution authorizing a corporate acquisition. Tests
 * document-onboarding's classification for corporate governance
 * documents and triggers the corporate specialist.
 *
 * This document type is distinct from contracts — it's an internal
 * corporate governance document, not a bilateral agreement. Tests
 * that the system correctly classifies it as "corporate/resolution"
 * rather than "contract."
 *
 * KNOWN METADATA:
 * - Type: corporate / resolution / board resolution
 * - Parties: Apex Ventures Inc. (company), Board of Directors
 * - Date: October 15, 2024
 * - Sections: Recitals, Resolutions, Certification
 * - Signatures: Richard Castillo (Secretary), Emily Tan (Chairperson)
 */

export const BOARD_RESOLUTION = {
  filename: 'board-resolution.txt',
  mimeType: 'text/plain',
  documentType: 'corporate',
  subType: 'resolution',

  parties: [
    { name: 'Apex Ventures Inc.', type: 'corporation', state: 'Delaware', role: 'company' },
  ],

  dates: {
    meetingDate: '2024-10-15',
  },

  signers: [
    { name: 'Richard Castillo', title: 'Secretary', party: 'Apex Ventures Inc.' },
    { name: 'Emily Tan', title: 'Chairperson of the Board', party: 'Apex Ventures Inc.' },
  ],

  expectedSections: ['recitals', 'resolutions', 'certification'],

  text: `RESOLUTIONS OF THE BOARD OF DIRECTORS
OF
APEX VENTURES INC.
(a Delaware Corporation)

Adopted at a Special Meeting of the Board of Directors
held on October 15, 2024

The following resolutions were duly adopted at a special meeting of the Board of Directors of Apex Ventures Inc. (the "Company"), held at the Company's principal offices at 2000 Sand Hill Road, Suite 100, Menlo Park, California 94025, on October 15, 2024, at which a quorum was present and acting throughout.

Present:
- Emily Tan, Chairperson of the Board
- Dr. Marcus Chen, Director
- Sofia Alvarez, Director
- James Worthington III, Director
- Priya Sharma, Director (via videoconference)

Also Present:
- Richard Castillo, Secretary of the Corporation
- Amanda Lee, Chief Financial Officer (non-voting)
- Daniel Goldberg, Esq., outside legal counsel (non-voting)

Absent:
- None. All directors were present.

RECITALS

WHEREAS, the Board of Directors (the "Board") of the Company has been presented with a proposal to acquire all of the issued and outstanding equity interests of QuantumLeap Analytics LLC, a California limited liability company ("Target"), pursuant to the terms and conditions set forth in a draft Membership Interest Purchase Agreement (the "Purchase Agreement"); and

WHEREAS, the Board has reviewed and considered: (a) the financial condition, results of operations, and business prospects of the Target; (b) the terms and conditions of the proposed Purchase Agreement; (c) a fairness opinion prepared by Silverstone Capital Partners LLC dated October 10, 2024, concluding that the consideration to be paid is fair, from a financial point of view, to the Company; (d) presentations by management regarding the strategic rationale for the acquisition, including expected revenue synergies and cost savings; and (e) advice from outside legal counsel regarding the legal aspects of the transaction; and

WHEREAS, the Board has determined, after careful deliberation, that the acquisition of the Target on the terms set forth in the Purchase Agreement is in the best interests of the Company and its stockholders;

NOW, THEREFORE, BE IT RESOLVED:

RESOLUTIONS

FIRST RESOLVED, that the acquisition of all of the issued and outstanding membership interests of QuantumLeap Analytics LLC by the Company, on the terms and conditions set forth in the Purchase Agreement, is hereby approved and authorized.

SECOND RESOLVED, that the aggregate purchase price for the acquisition shall not exceed Forty-Five Million Dollars ($45,000,000.00), consisting of: (a) Twenty-Five Million Dollars ($25,000,000.00) in cash; and (b) Twenty Million Dollars ($20,000,000.00) in newly issued shares of the Company's Series C Preferred Stock, valued at $12.50 per share.

THIRD RESOLVED, that Emily Tan, as Chairperson of the Board, and Amanda Lee, as Chief Financial Officer, are hereby authorized and directed, for and on behalf of the Company, to negotiate, execute, and deliver the Purchase Agreement and all ancillary documents, agreements, certificates, and instruments, including but not limited to: (a) the Purchase Agreement; (b) an Escrow Agreement; (c) Employment Agreements with key employees of the Target; (d) Non-Competition Agreements with the Target's founders; and (e) any consents, waivers, or approvals required in connection with the transaction.

FOURTH RESOLVED, that the officers of the Company are hereby authorized to take such actions and execute such documents as may be necessary or advisable to consummate the acquisition, including: (a) filing any required notices with governmental authorities; (b) obtaining any necessary regulatory approvals; (c) issuing the Series C Preferred Stock as contemplated above; and (d) amending the Company's Certificate of Incorporation as necessary to authorize the issuance of additional shares.

FIFTH RESOLVED, that the Company shall establish a holdback escrow in the amount of Five Million Dollars ($5,000,000.00) from the purchase price, to be held for a period of eighteen (18) months following closing, to secure the Target's representations, warranties, and indemnification obligations under the Purchase Agreement.

SIXTH RESOLVED, that the Board hereby ratifies and confirms all actions heretofore taken by the officers, employees, and agents of the Company in connection with the proposed acquisition that are consistent with and in furtherance of the foregoing resolutions.

SEVENTH RESOLVED, that these resolutions shall be effective immediately upon adoption and shall remain in effect until the earlier of: (a) the closing of the acquisition; (b) the termination of the Purchase Agreement in accordance with its terms; or (c) revocation by the Board.

CERTIFICATION

I, Richard Castillo, Secretary of Apex Ventures Inc., do hereby certify that:

1. The foregoing resolutions were duly adopted at a special meeting of the Board of Directors held on October 15, 2024, at which a quorum was present and acting throughout.

2. The resolutions were adopted by the unanimous vote of all directors present.

3. The resolutions have not been rescinded, modified, or amended and remain in full force and effect as of the date hereof.

4. The meeting was duly called and held in accordance with the Company's Bylaws and the Delaware General Corporation Law.

IN WITNESS WHEREOF, I have hereunto set my hand and affixed the corporate seal of the Company this 15th day of October, 2024.

_________________________
Richard Castillo
Secretary, Apex Ventures Inc.

ACKNOWLEDGED:

_________________________
Emily Tan
Chairperson of the Board
Apex Ventures Inc.`,
};

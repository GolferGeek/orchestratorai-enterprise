/**
 * Test fixtures for ingested documents.
 *
 * Three documents representing realistic discovery corpus content:
 *   doc-001 — an email thread (potentially relevant)
 *   doc-002 — a contract (relevant)
 *   doc-003 — a legal memo (potentially privileged)
 */

export const fixtureDocuments = [
  {
    documentId: 'doc-001',
    name: 'email-thread-product-roadmap.eml',
    content: `From: john.smith@acmecorp.com
To: sales-team@acmecorp.com
Date: 2023-03-15
Subject: Q2 Product Roadmap — Confidential

Team,

As discussed in Tuesday's meeting, our Q2 roadmap includes several features
that overlap with what we've seen Globex demoing. Please keep this internal
until the announcement next month.

The pricing changes will take effect April 1. Customer data exports should be
ready for the new portal by March 31.

— John

---
From: alice.chen@acmecorp.com [Legal]
To: john.smith@acmecorp.com
Date: 2023-03-16
Subject: RE: Q2 Product Roadmap — Confidential

John,

Before you distribute any further, please loop in outside counsel
(Jane Doe at Doe & Associates) regarding the Globex overlap. This
could have privilege implications.

— Alice Chen, General Counsel`,
    mimeType: 'message/rfc822',
    sizeBytes: 820,
  },
  {
    documentId: 'doc-002',
    name: 'supply-agreement-globex-2022.pdf',
    content: `SUPPLY AND SERVICES AGREEMENT

This Supply and Services Agreement ("Agreement") is entered into as of
January 10, 2022, by and between Acme Corp ("Buyer") and Globex Inc ("Supplier").

1. SERVICES. Supplier agrees to provide Buyer with access to its data analytics
   platform under the terms set forth herein.

2. PRICING. The fees for the services shall be as set forth in Exhibit A.
   Pricing is confidential and shall not be disclosed to third parties.

3. INTELLECTUAL PROPERTY. Each party retains ownership of its pre-existing
   intellectual property. Any jointly developed work product shall be owned
   equally by both parties.

4. TERM. This Agreement commences on the Effective Date and continues for
   a period of two (2) years, unless earlier terminated.

5. GOVERNING LAW. This Agreement shall be governed by the laws of Delaware.`,
    mimeType: 'application/pdf',
    sizeBytes: 1240,
  },
  {
    documentId: 'doc-003',
    name: 'legal-memo-trade-secret-analysis.docx',
    content: `PRIVILEGED AND CONFIDENTIAL
ATTORNEY-CLIENT COMMUNICATION
ATTORNEY WORK PRODUCT

MEMORANDUM

TO: John Smith, CEO, Acme Corp
FROM: Jane Doe, Doe & Associates LLP
DATE: June 5, 2023
RE: Analysis of Trade Secret Claims Against Globex Inc.

EXECUTIVE SUMMARY

This memorandum analyzes the viability of trade secret misappropriation
claims against Globex Inc. based on the documents you provided.

ANALYSIS

The customer data export functionality described in your Q2 roadmap email
closely resembles the patent-pending technology described in Globex's
recent product announcement. While similarity alone does not establish
misappropriation, the timeline and the nature of overlap warrant investigation.

RECOMMENDATION

We recommend preserving all internal communications discussing the product
roadmap from January 2022 through the present for potential litigation hold.

This memorandum is protected by the attorney-client privilege and the
work-product doctrine. Do not distribute without my prior written consent.`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 1680,
  },
];

/** Storage paths that parallel fixtureDocuments (used in ingest node tests). */
export const fixtureDocumentPaths = [
  'uploads/job-test/0-email-thread-product-roadmap.eml',
  'uploads/job-test/1-supply-agreement-globex-2022.pdf',
  'uploads/job-test/2-legal-memo-trade-secret-analysis.docx',
];

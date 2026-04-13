---
**Document ID:** SOX-SEC-802
**Framework:** SOX (Sarbanes-Oxley Act of 2002)
**Version:** 1.0
**Effective Date:** July 30, 2002
**Classification:** Regulatory Framework — Public
**Owner:** U.S. Securities and Exchange Commission (SEC) / Public Company Accounting Oversight Board (PCAOB)
**Review Cycle:** Per legislative/regulatory amendment
**Related Documents:** [SOX-SEC-201], [SOX-SEC-303], [SOX-SEC-806], [SOX-SEC-PCAOB]
---

# Section 802: Criminal Penalties for Altering Documents

## Overview

Section 802 of the Sarbanes-Oxley Act establishes severe criminal penalties for the destruction, alteration, or falsification of records in connection with federal investigations and bankruptcy proceedings, and mandates specific retention periods for audit workpapers. Codified at 18 U.S.C. Sections 1519 and 1520, these provisions address the document shredding and evidence destruction that characterized the Enron and Arthur Andersen scandals.

## 18 U.S.C. Section 1519 — Destruction of Records in Federal Investigations

### Statutory Prohibition
Whoever knowingly **alters, destroys, mutilates, conceals, covers up, falsifies, or makes a false entry** in any record, document, or tangible object with the **intent to impede, obstruct, or influence** the investigation or proper administration of any matter within the jurisdiction of any department or agency of the United States or any case filed under Title 11 (bankruptcy), or in relation to or contemplation of any such matter or case, shall be fined under this title, imprisoned not more than **20 years**, or both.

### Key Elements

#### 1. Knowing Action
The defendant must **knowingly** alter, destroy, mutilate, conceal, cover up, falsify, or make a false entry. The knowledge requirement means the defendant must be aware that they are engaging in the prohibited conduct — it does not require knowledge that the conduct is unlawful.

#### 2. Any Record, Document, or Tangible Object
The scope is extremely broad:
- Paper documents, electronic files, emails, instant messages
- Financial records, accounting workpapers, contracts
- Hard drives, backup tapes, servers, cloud storage
- Physical objects (tangible objects subject to some circuit-level debate after *Yates v. United States*, 574 U.S. 528 (2015), which narrowed "tangible object" in 18 U.S.C. Section 1519's companion statute)
- Metadata and system logs

#### 3. Intent to Impede, Obstruct, or Influence
- The defendant must act with the specific intent to obstruct
- A federal investigation need not be pending or even imminent — the statute applies "in relation to or contemplation of" any such matter
- This is a critical distinction from prior obstruction statutes: Section 1519 does not require an existing proceeding, making it a powerful anticipatory obstruction tool

#### 4. Federal Agency Jurisdiction
The matter must be within the jurisdiction of a federal department or agency. Given the broad scope of federal jurisdiction (SEC, FBI, DOJ, IRS, CFTC, FDIC, OCC, etc.), virtually any financial document destruction could fall within this provision.

### Applicability — Any Person
Unlike many SOX provisions that apply specifically to issuers, officers, or auditors, Section 1519 applies to **any person** — including:
- Corporate officers and directors
- Employees at any level
- Outside counsel and consultants
- Accounting firm personnel
- Third-party service providers
- Individuals acting in a personal capacity

## 18 U.S.C. Section 1520 — Audit Workpaper Retention

### Mandatory Retention Period
Any accountant who conducts an audit of an issuer of securities to which Section 10A(a) of the Securities Exchange Act of 1934 applies shall maintain all **audit or review workpapers** for a period of **7 years** from the end of the fiscal period in which the audit or review was concluded.

### Scope of Workpapers
The SEC and PCAOB have interpreted "audit or review workpapers" broadly to include:
- All records that form the basis of the auditor's opinion
- Documentation of audit planning, including risk assessments and materiality determinations
- Evidence of audit procedures performed and conclusions reached
- Correspondence between the auditor and the issuer regarding the audit
- Internal memoranda and analyses prepared by the engagement team
- Confirmations, representations, and schedules obtained from the issuer
- Work performed by specialists, internal auditors, or other auditors whose work was relied upon
- Summaries of significant findings, issues, and how they were resolved
- Electronic workpapers, including data analytics files and automated testing output

### PCAOB Rule 3100 and AS 1215
PCAOB Auditing Standard AS 1215 (Audit Documentation) requires:
- Documentation must be sufficient to enable an experienced auditor, having no previous connection with the engagement, to understand the work performed, evidence obtained, and conclusions reached
- The audit documentation completion date is **45 days** after the report release date (the "documentation completion date" or "assembly date")
- After the documentation completion date, audit documentation must not be deleted or discarded, but additional documentation may be added with appropriate notation

### Penalties for Violation
Failure to maintain audit workpapers as required by Section 1520 is punishable by:
- Fines under Title 18
- Imprisonment of not more than **10 years**
- Or both

## Interaction with Document Retention Policies

### Corporate Document Retention Programs
Companies must carefully design document retention and destruction policies to balance:
- Legal hold obligations when litigation or investigation is reasonably anticipated
- Regulatory retention requirements (SEC rules require retention of books and records for specified periods under Exchange Act Rule 17a-4 for broker-dealers, Investment Advisers Act for advisers)
- Section 1519's broad anticipatory obstruction provisions

### Legal Hold Requirements
When a company becomes aware of a pending or reasonably anticipated investigation or litigation:
- All routine document destruction must be **immediately suspended** for documents potentially relevant to the matter
- A formal **litigation hold notice** must be issued to all custodians of potentially relevant documents
- Compliance with the hold must be monitored and documented
- Failure to implement an adequate legal hold can result in sanctions, adverse inference instructions, and potential criminal liability under Section 1519

### Safe Harbor for Routine Destruction
Document destruction conducted pursuant to a bona fide, consistently applied document retention policy, **without knowledge of a pending or contemplated investigation**, generally does not violate Section 1519. However:
- The policy must be adopted and implemented in good faith
- Selective acceleration of destruction for specific documents raises significant suspicion
- The policy must be suspended when a legal hold is triggered

## Notable Prosecutions

### Arthur Andersen LLP (2002)
- Andersen partners and employees shredded tons of Enron-related audit documents after learning of the SEC investigation
- Andersen was convicted of obstruction of justice (under the pre-SOX obstruction statute)
- The Supreme Court reversed the conviction in *Arthur Andersen LLP v. United States*, 544 U.S. 696 (2005), on jury instruction grounds
- Section 802 was enacted in direct response to close the legal gaps exposed by the Andersen prosecution

### Subsequent Enforcement
Federal prosecutors have used Section 1519 extensively since its enactment:
- Against corporate executives who directed deletion of incriminating emails
- Against employees who falsified accounting records
- Against third parties who destroyed evidence to protect corporate clients
- Against individuals who altered electronic metadata to conceal document tampering

## Electronic Records and Digital Evidence

### E-Discovery Obligations
- Electronic documents are subject to the same retention and preservation obligations as paper records
- Companies must preserve relevant electronically stored information (ESI) including emails, instant messages, voicemails, databases, and social media
- Automatic deletion systems (email purge schedules, auto-archive routines) must be suspended during legal holds

### Cloud Storage and Third-Party Systems
- Documents stored in cloud environments, SaaS platforms, and third-party systems are within the scope of Section 1519
- Companies must ensure they can preserve and produce documents stored by third-party service providers
- Contractual provisions with cloud/SaaS providers should address data preservation obligations

### Metadata Preservation
- Altering metadata (creation dates, author information, modification history) with intent to obstruct constitutes a violation
- Forensic analysis of metadata is a standard investigation technique used by the SEC and DOJ

## Penalties Summary

| Violation | Fine | Imprisonment |
|-----------|------|--------------|
| Section 1519: Destruction/alteration with intent to obstruct | Per Title 18 (up to $250,000 individual / $500,000 organization) | Up to 20 years |
| Section 1520: Failure to retain audit workpapers for 7 years | Per Title 18 | Up to 10 years |

## Compliance Checklist

- [ ] Adopt and maintain a comprehensive document retention and destruction policy
- [ ] Include all categories of records: paper, electronic, cloud-based, third-party hosted
- [ ] Define retention periods that meet or exceed all regulatory requirements (7 years minimum for audit workpapers)
- [ ] Implement legal hold procedures triggered by knowledge of pending or contemplated investigations or litigation
- [ ] Train all employees on document retention obligations and the consequences of unauthorized destruction
- [ ] Prohibit selective or accelerated destruction of documents outside the normal retention schedule
- [ ] Ensure e-discovery readiness: ability to identify, preserve, collect, and produce electronically stored information
- [ ] Audit third-party and cloud provider agreements for data preservation capabilities
- [ ] Monitor compliance with legal holds through periodic custodian reminders and spot checks
- [ ] External auditors must maintain workpaper completion within 45 days of report release date (PCAOB AS 1215)
- [ ] Retain audit documentation for minimum 7 years from end of fiscal period of audit conclusion

## Cross-References

- Auditor independence and workpaper integrity: [SOX-SEC-201]
- Prohibition on improper influence leading to document alteration: [SOX-SEC-303]
- Whistleblower protections for reporting document destruction: [SOX-SEC-806]
- PCAOB audit documentation standards: [SOX-SEC-PCAOB]

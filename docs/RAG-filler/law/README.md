# Law Firm RAG Collection

**Document ID:** LAW-README
**Smith & Associates, PLLC - Legal Document Library**
**Last Updated:** January 5, 2026
**Total Documents:** 17
**Total Lines:** 12,500+

---

Sample legal documents for demonstrating advanced RAG capabilities in law firm settings.

**DISCLAIMER**: These are fictional sample documents for demonstration purposes only. Not legal advice.

---

## Document Structure

This collection is organized to support multiple RAG retrieval strategies:

### RAG Complexity Types Demonstrated

| RAG Type | Description | Document Examples |
|----------|-------------|-------------------|
| `attributed` | Document/section citations | Firm Policies - Citations needed |
| `hybrid` | Keyword + semantic search | Contract Templates & Clause Library - Legal terms |
| `cross-reference` | Multi-document traversal | Litigation docs - Documents reference each other |
| `temporal` | Version-aware retrieval | Client Intake - Multiple versions (v1 and v2) |

---

## Folder Structure

```
law/
├── README.md                    # This file
├── contracts/
│   ├── templates/               # Contract templates
│   │   ├── nda-template.md              # Standard NDA (600+ lines)
│   │   ├── engagement-letter-template.md # Engagement letter (800+ lines)
│   │   └── master-services-agreement.md  # MSA template (750+ lines)
│   └── clause-library/          # Reusable clause repository
│       └── master-clause-library.md      # Clause library (1200+ lines)
├── client-intake/
│   └── checklists/              # Practice area intake checklists
│       ├── personal-injury-intake-checklist.md    # PI Intake v1 (1300+ lines)
│       └── personal-injury-intake-checklist-v2.md # PI Intake v2 (450+ lines)
├── firm-policies/
│   ├── billing/                 # Fee and billing policies
│   │   └── fee-agreement-policy.md       # Fee policy (850+ lines)
│   ├── ethics/                  # Confidentiality, conflicts
│   │   ├── client-confidentiality-policy.md  # Confidentiality (1200+ lines)
│   │   └── conflict-of-interest-policy.md    # Conflicts (950+ lines)
│   └── operations/              # File retention, IT policies
│       └── file-retention-policy.md      # File retention (570+ lines)
├── litigation/
│   ├── motions/                 # Motion checklists and templates
│   │   └── motion-to-dismiss-checklist.md    # MTD checklist (1000+ lines)
│   ├── discovery/               # Discovery checklists
│   │   ├── written-discovery-checklist.md    # Written discovery (650+ lines)
│   │   └── deposition-checklist.md           # Deposition guide (600+ lines)
│   └── trial-prep/              # Trial preparation materials
│       └── trial-preparation-checklist.md    # Trial prep (700+ lines)
└── estate-planning/
    └── guides/                  # Planning guides
        └── basic-estate-plan-guide.md    # Estate planning (1240+ lines)
```

---

## Document Inventory

### Contracts (4 documents)

| Document | Location | Lines | RAG Type | Doc ID |
|----------|----------|-------|----------|--------|
| Standard NDA Template | `contracts/templates/` | 600+ | hybrid | CON-001 |
| Engagement Letter Template | `contracts/templates/` | 800+ | hybrid | CON-002 |
| Master Services Agreement | `contracts/templates/` | 750+ | hybrid | CON-003 |
| Master Clause Library | `contracts/clause-library/` | 1200+ | hybrid | CON-CL-001 |

### Firm Policies (4 documents)

| Document | Location | Lines | RAG Type | Doc ID |
|----------|----------|-------|----------|--------|
| Fee Agreement Policy | `firm-policies/billing/` | 850+ | attributed | FP-001 |
| Client Confidentiality Policy | `firm-policies/ethics/` | 1200+ | attributed | FP-002 |
| Conflict of Interest Policy | `firm-policies/ethics/` | 950+ | attributed | FP-003 |
| File Retention Policy | `firm-policies/operations/` | 570+ | attributed | FP-004 |

### Litigation (4 documents)

| Document | Location | Lines | RAG Type | Doc ID |
|----------|----------|-------|----------|--------|
| Motion to Dismiss Checklist | `litigation/motions/` | 1000+ | cross-reference | LIT-003 |
| Written Discovery Checklist | `litigation/discovery/` | 650+ | cross-reference | LIT-001 |
| Deposition Checklist | `litigation/discovery/` | 600+ | cross-reference | LIT-002 |
| Trial Preparation Checklist | `litigation/trial-prep/` | 700+ | cross-reference | LIT-004 |

### Client Intake (2 documents)

| Document | Location | Lines | RAG Type | Doc ID |
|----------|----------|-------|----------|--------|
| Personal Injury Intake Checklist v1 | `client-intake/checklists/` | 1300+ | temporal | CI-PI-001-v1 |
| Personal Injury Intake Checklist v2 | `client-intake/checklists/` | 450+ | temporal | CI-PI-001-v2 |

### Estate Planning (1 document)

| Document | Location | Lines | RAG Type | Doc ID |
|----------|----------|-------|----------|--------|
| Comprehensive Estate Planning Guide | `estate-planning/guides/` | 1240+ | attributed | EP-001 |

---

## RAG Demo Scenarios

### Scenario 1: Attributed RAG (Firm Policies)
**Query**: "What are our billing policies for contingency fee matters?"
**Expected**: Sections from Fee Agreement Policy with document ID, section, and subsection citations (e.g., FP-001, Article II, Section 2.1)

### Scenario 2: Hybrid Search (Contracts)
**Query**: "Find all clauses related to indemnification"
**Expected**: Exact match on "indemnification" keyword PLUS semantically similar clauses about liability protection from clause library

### Scenario 3: Cross-Reference RAG (Litigation)
**Query**: "What discovery needs to happen before a motion to dismiss?"
**Expected**: Discovery checklist sections PLUS motion to dismiss timeline with cross-references identified between LIT-001, LIT-002, LIT-003, and LIT-004

### Scenario 4: Temporal RAG (Client Intake)
**Query**: "What changed in our PI intake process?"
**Expected**: Version comparison showing additions, removals, and modifications between v1.0 and v2.0 (explicit change table in v2)

### Scenario 5: Multi-Document Navigation (Cross-Reference)
**Query**: "What are all the steps from client intake to trial?"
**Expected**: Connected flow through CI-PI-001 → LIT-001 → LIT-002 → LIT-003 → LIT-004

### Scenario 6: Section-Level Attribution
**Query**: "What are the specific procedures for conflict waivers?"
**Expected**: FP-003, Article IV, Section 4.3 with full section hierarchy preserved

---

## Document Features for RAG

All documents include:
- **Document ID**: Unique identifier for attribution (e.g., FP-001, LIT-003)
- **Version**: For temporal tracking (e.g., Version 3.0)
- **Cross-References**: Links to related documents with reference IDs
- **Section Hierarchy**: Deep structure (H1 > H2 > H3 > H4) for section-aware chunking
- **Legal Terminology**: Specific legal terms for keyword matching
- **Revision History**: For temporal RAG demonstration
- **Tables and Checklists**: Structured data for hybrid retrieval

---

## Sample Queries

Once loaded into a RAG agent, test with:

### Basic Retrieval
- "What are the key terms in our standard NDA?"
- "What is included in our estate planning package?"
- "What are our billing rates for litigation matters?"

### Attributed Retrieval
- "What is our policy on client confidentiality? Include section references."
- "Cite the firm policy on conflict waivers."
- "What does FP-002, Section 3.2 say about electronic communications?"

### Hybrid Search
- "Find contract clauses about force majeure and impossibility of performance"
- "Show me all references to trade secrets in our templates"
- "What provisions address limitation of liability?"

### Cross-Reference Retrieval
- "What are all the documents related to new client onboarding?"
- "Show me how our discovery checklist relates to motion practice"
- "What documents cross-reference the confidentiality policy?"

### Temporal Retrieval
- "What changes were made to the PI intake checklist in version 2?"
- "Show me the evolution of our confidentiality policy"
- "What new sections were added in the latest PI intake version?"

### Complex Multi-Hop Queries
- "If a client has a conflict with an existing client, what documents govern the process?"
- "What are the billing considerations for discovery in personal injury cases?"
- "How do our file retention rules apply to closed personal injury matters?"

---

## Technical Notes

### Chunking Strategy
- Recommended chunk size: 500-1000 tokens
- Preserve section hierarchy in metadata
- Include document ID and section path in each chunk
- Keep tables intact (don't split mid-table)

### Metadata Schema
```json
{
  "document_id": "FP-001",
  "document_title": "Fee Agreement Policy",
  "section_path": "Article II > Section 2.1 > 2.1.1",
  "section_title": "Standard Hourly Rates",
  "version": "3.2",
  "effective_date": "2026-01-05",
  "rag_type": "attributed",
  "cross_references": ["FP-002", "CON-002", "CI-PI-001"]
}
```

### Cross-Reference Mapping
```json
{
  "FP-001": ["FP-002", "CON-002"],
  "FP-002": ["FP-001", "FP-003", "FP-004"],
  "FP-003": ["FP-002", "FP-001", "CON-002"],
  "FP-004": ["FP-002", "FP-001"],
  "LIT-001": ["LIT-002", "LIT-003", "LIT-004"],
  "LIT-002": ["LIT-001", "LIT-003", "LIT-004"],
  "LIT-003": ["LIT-001", "LIT-002", "LIT-004", "FP-001"],
  "LIT-004": ["LIT-001", "LIT-002", "LIT-003"],
  "CI-PI-001": ["FP-001", "FP-002", "LIT-001"],
  "EP-001": ["FP-001", "FP-002", "CON-002"]
}
```

### Version Tracking (Temporal RAG)
```json
{
  "CI-PI-001": {
    "versions": ["1.0", "2.0"],
    "files": {
      "1.0": "personal-injury-intake-checklist.md",
      "2.0": "personal-injury-intake-checklist-v2.md"
    },
    "change_summary_in_v2": true
  }
}
```

---

## Summary Statistics

| Category | Count | Total Lines |
|----------|-------|-------------|
| Contracts | 4 | ~3,350 |
| Firm Policies | 4 | ~3,570 |
| Litigation | 4 | ~2,950 |
| Client Intake | 2 | ~1,750 |
| Estate Planning | 1 | ~1,240 |
| **Total** | **17** | **~12,860** |

---

*Contact the RAG Development Team for integration questions.*

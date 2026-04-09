# Intention: Discovery Document Review

## Priority: #7 of 10 Legal Workflows

## What

In litigation, discovery produces thousands to millions of documents that must be reviewed for relevance, privilege, and issue coding before production to the opposing party. This is the most expensive phase of litigation — BigLaw firms spend billions per year on document review, typically staffing armies of contract attorneys at $50-80/hr to review documents one by one, applying relevance tags, privilege designations, and issue codes.

The Legal Department runs a **high-volume document review pipeline** that performs first-pass coding at scale. Agents classify each document for relevance (relevant / not relevant / potentially relevant), privilege (privileged / not privileged / potentially privileged), and issue tags (from a configurable issue list defined for the matter). Potentially privileged documents are flagged for mandatory human review. All other documents get confidence scores, and the system routes them to **batch HITL review** — the reviewer sees batches of 50-100 coded documents at a time, spot-checks the coding, and approves or corrects in bulk.

The user clicks "Start a Document Review" in the Legal Department workspace, uploads the document set (or points to a storage location), defines the review protocol (relevance criteria, privilege holders, issue list), and launches. The activity feed shows the review progressing through the document set with real-time statistics: documents reviewed, relevance breakdown, privilege flags, issue distribution.

## Why

### The market

Document review is litigation's largest single cost center. For a mid-size commercial dispute:
- 50,000-200,000 documents produced in discovery
- Contract attorney review: $50-80/hr × 3-5 minutes per document × 100,000 documents = $250K-$650K
- For complex litigation (antitrust, IP, class action): multiply by 5-10x
- TAR (Technology Assisted Review) tools reduce costs by 40-60% but still require significant human review

The platform's approach is different from TAR: instead of "find me similar documents to these seed examples" (the TAR paradigm), we apply **specialist reasoning** to each document. The privacy specialist identifies privileged communications. The litigation specialist assesses relevance to the claims. The employment specialist identifies HR-related documents. This is closer to how a senior associate reviews documents — with judgment, not just pattern matching.

### The patterns it builds on

- **Batch document processing from Due Diligence (#4)** — the document dispatcher loop, progressive reporting, and per-document analysis pipeline. Discovery is DD at 10-100x scale.
- **Clause-level annotations from Contract Review (#1)** — each document gets structured annotations (relevance tag, privilege designation, issue codes) rather than prose analysis.
- **The same specialist infrastructure** — the existing 8 specialists, adapted for document review tasks.

### The pattern it introduces

**Batch HITL review** — a new HITL pattern where the reviewer processes batches of documents rather than individual items. This is critical for any high-volume workflow:

- The reviewer sees a batch of 50-100 coded documents, organized by the system's confidence level
- Low-confidence documents are shown first (most likely to need correction)
- The reviewer can approve-all for high-confidence batches, or drill into specific documents
- Each batch approval updates the system's coding statistics and adjusts confidence calibration

This pattern doesn't exist in the current HITL implementation (which is per-job approve/reject/modify). It's a new UX pattern that any future high-volume workflow can reuse.

## The shape of the thing

### Review protocol definition

Before documents are uploaded, the reviewer defines the review protocol:

```typescript
interface ReviewProtocol {
  matterId: string;
  matterName: string;
  
  // Relevance criteria
  relevanceCriteria: {
    claims: string[];              // Legal claims at issue
    dateRange?: { start: string; end: string };
    keyParties: string[];          // Parties whose communications are relevant
    keyTopics: string[];           // Topics that indicate relevance
    exclusions?: string[];         // Topics/doc types that are per se not relevant
  };
  
  // Privilege identification
  privilegeHolders: {
    attorneys: string[];           // Names of attorneys (for attorney-client privilege)
    firms: string[];               // Law firm names
    inHouseCounsel: string[];      // In-house legal team
  };
  
  // Issue coding
  issueTags: {
    tagId: string;
    tagName: string;
    description: string;           // What this issue tag means
  }[];
  
  // Review settings
  batchSize: number;               // Documents per HITL batch (default 50)
  confidenceThreshold: number;     // Below this, flag for human review (default 0.7)
  privilegeReviewRequired: boolean; // If true, ALL privilege flags require human review (default true)
}
```

### Phase 1: Document ingestion and classification

Documents are ingested in batches, classified by type (email, attachment, contract, memo, presentation, spreadsheet, other), and indexed. Each document gets a unique `documentId` and basic metadata (date, author/sender, recipients, subject if available).

For email threads, the system identifies the thread structure and processes the thread as a unit rather than individual emails (this is standard in litigation review — you need the context of the full thread to assess relevance and privilege).

### Phase 2: First-pass coding

Each document flows through a review pipeline:

1. **Relevance assessment** — an LLM call that receives the document text, the relevance criteria from the protocol, and produces:
   - Relevance: relevant / not relevant / potentially relevant
   - Confidence: 0.0-1.0
   - Reasoning: 1-2 sentences explaining the assessment
   - Matching criteria: which claims/topics/parties matched

2. **Privilege assessment** — an LLM call that:
   - Identifies whether any privilege holder is a party to the communication
   - Checks for legal advice content (attorney-client privilege)
   - Checks for work product (litigation preparation materials)
   - Produces: privileged / not privileged / potentially privileged
   - Confidence: 0.0-1.0
   - Privilege type: attorney-client / work product / both / none

3. **Issue coding** — an LLM call that applies issue tags:
   - For each issue tag in the protocol, assesses whether the document is relevant
   - Produces: list of applicable tags with confidence scores

4. **Hot document flag** — if the document is highly relevant AND contains damaging or critical content:
   - Flag as "hot document"
   - Brief explanation of why it's significant

**Critical safety rule for privilege:** Any document flagged as "potentially privileged" (confidence < 0.95 on "not privileged") MUST go through human review before production. Producing a privileged document to the opposing party is one of the most serious errors in litigation — it can waive privilege permanently. The system errs heavily on the side of flagging for human review.

### Phase 3: Batch HITL review

Documents are grouped into review batches:

**Batch types (in review order):**
1. **Privilege review batch** — all documents flagged as potentially or definitely privileged. These MUST be reviewed by a human. No exceptions.
2. **Low-confidence relevance batch** — documents where the relevance assessment confidence is below the threshold. Organized with lowest confidence first.
3. **Hot document batch** — flagged significant documents for the reviewer to see.
4. **High-confidence sample batch** — a random sample of high-confidence "not relevant" documents for the reviewer to spot-check. This is quality control — if the system is systematically miscoding a document type, the sample reveals it.

**Batch review UI:**

The `BatchReviewPanel.vue` component shows:
- A table of documents in the batch with their coding (relevance, privilege, issues)
- Each row is expandable to show the document text and the system's reasoning
- The reviewer can:
  - **Approve** individual documents (accept the system's coding)
  - **Correct** individual documents (change the coding)
  - **Approve remaining** — accept all uncorrected documents in the batch
  - **Flag for senior review** — escalate a document to a more senior reviewer
- Batch statistics: approval rate, correction rate, correction patterns

**Calibration feedback:** When the reviewer corrects a coding, the system logs the correction. After each batch, the system checks whether corrections reveal a systematic pattern (e.g., "the reviewer keeps marking emails from legal@company.com as privileged but the system coded them as not privileged"). If a pattern is detected, the system adjusts its assessment criteria and re-codes uncoded documents in the queue.

### Phase 4: Production set generation

After all batches are reviewed:

- **Production set** — all relevant, non-privileged documents (with Bates numbering if configured)
- **Privilege log** — a formatted log of all privileged documents with the privilege basis, as required by court rules
- **Review statistics** — total documents, relevance breakdown, privilege count, issue distribution, human correction rate, confidence calibration
- **Hot document summary** — the flagged significant documents with annotations

### Frontend: Review Dashboard

The document review detail panel has five tabs:

1. **Overview** — real-time progress (documents coded, batches reviewed, production set size) with charts
2. **Batch Queue** — pending batches for review, with the batch review panel
3. **Document Browser** — searchable/filterable table of all documents with their coding
4. **Privilege Log** — the formatted privilege log
5. **Production Set** — the final production set with export options

### Performance: handling volume

Discovery documents can number in the tens of thousands. The pipeline must handle this:

- **On Ollama (sovereign):** Sequential processing, ~30 seconds per document (3 LLM calls × 10 seconds each). 50,000 documents = ~17 days. This is acceptable for ongoing discovery where documents trickle in, but not for a one-time bulk review. For bulk review on sovereign hardware, a multi-GPU cluster or multiple Mac Studios are needed.
- **On cloud providers:** Parallel processing at 10-50 concurrent, ~5 seconds per document. 50,000 documents = ~7-35 hours. This is the realistic deployment for large reviews.
- **Hybrid approach:** Privilege assessment on sovereign (privileged documents never leave the building), relevance and issue coding on cloud (these aren't privilege-sensitive). This is the pragmatic enterprise deployment.

The pipeline supports all three modes via the existing provider concurrency configuration.

## Constraints

- **Privilege safety is absolute.** Any document with ANY signal of privilege goes through human review. The system NEVER autonomously classifies a document as "not privileged" when there is any doubt. The confidence threshold for "definitely not privileged" is 0.95, not the standard 0.7.
- **No fallbacks on document failures.** Failed documents are logged and included in the review statistics. They are NOT silently excluded from the production set.
- **ExecutionContext is the capsule.** One review = one job = one conversationId.
- **The batch HITL pattern is a new UX, not a modification of the existing per-job HITL.** The existing approve/reject/modify flow remains for other workflows. Batch review is an additional HITL mode.
- **Bates numbering is optional.** Not all courts require it, and the format varies. If configured, the system applies it at production set generation time, not during coding.

## Out of scope

- **Predictive coding / TAR integration.** Continuous active learning from reviewer decisions to re-rank the uncoded document queue. This is the natural evolution but it's a separate ML effort.
- **Multi-reviewer workflow.** Multiple reviewers working on the same review with work assignment and conflict resolution. Future enhancement.
- **Production formatting.** Converting documents to TIFF/PDF with redactions as required by some courts. Future export feature.
- **Deduplication.** Identifying and removing duplicate documents before review. Standard in litigation but a separate pre-processing step.
- **Email threading intelligence.** Beyond basic thread grouping, understanding forward chains and CC patterns. Future enhancement.

## Dependencies

- Due Diligence (#4) — batch document processing pattern, document dispatcher loop
- Contract Review (#1) — annotation output format
- Legal Department async workspace (completed)
- Legal Department HITL (completed — but batch HITL is a new mode)

## Estimated scope

Large. 4-5 weeks. The review protocol definition, three-stage coding pipeline, batch HITL review UI, privilege log generation, and production set assembly are all net-new. The document dispatcher and progressive reporting reuse patterns from DD (#4).

## Why this goes seventh

- BigLaw's #1 spend category — this is the workflow that pays for everything else.
- Builds naturally on DD (#4)'s batch processing pattern at larger scale.
- Batch HITL is a new pattern that future high-volume workflows can reuse.
- Privilege safety is a hard problem worth solving in a dedicated workflow rather than as a feature of something else.
- By this point we've built the annotation pattern (#1), research (#2), adversarial (#3), batch processing (#4), and compliance (#5) — all of which inform how we approach this high-stakes, high-volume workflow.

# Discovery Review — What It Does

## Purpose

Discovery Review handles the bulk coding of discovery documents — the most time-consuming task in litigation. The AI pre-codes each document (relevant/privileged/produced/withheld), then presents them to a human reviewer in batches for confirmation or correction.

## The Four HITL Batch Gates

Discovery Review is unique in having **4 sequential HITL gates** — each pauses for a specific type of human review:

1. **`batch_hitl_privilege`** — privilege assertions (attorney-client, work product). High-stakes: privilege decisions have legal consequences if wrong.
2. **`batch_hitl_relevance`** — relevance coding (relevant/not relevant to claims). Volume-heavy — most documents go through here.
3. **`batch_hitl_hot_docs`** — key document review. AI-flagged "hot" documents that are likely to be significant at trial.
4. **`batch_hitl_sample`** — sampling verification. Random sample of AI-coded documents for quality control.

Each gate shows a `BatchReviewPanel` — a batch of documents with AI's coding recommendation and the reviewer's confirm/override controls.

## Input

- Multi-file upload (discovery production)
- Discovery protocol form:
  - Matter ID and name
  - Claims (what the case is about)
  - Date range (scope of discovery)
  - Key parties (whose communications are relevant)
  - Key topics (issues in the case)
  - Exclusions (documents to ignore)

## Output

After all 4 HITL gates pass and calibration check:
- Document coding grid with final status for each document
- Production set (documents coded "produced")
- Privilege log (documents coded "privileged" with basis)
- Quality metrics (calibration score, consistency rate)

## Why 4 Gates Matter

Privilege review and relevance coding have legal and ethical implications. The workflow architecturally separates them so each type of decision gets independent human review — not a single "approve all" gate. This is defensible in court as a documented human-in-the-loop review process.

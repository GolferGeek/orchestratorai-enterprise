import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { InvoiceOutcome } from './finance-store.service';
import type { InvoiceReviewState, JevVerdict } from './invoice-review.state';
import type { ExtractedInvoice, LineMatch, MatchException, PurchaseOrder } from './three-way-match';

export interface InvoiceReviewResult {
  outcome: InvoiceOutcome;
  reviewNote: string | null;
  po: PurchaseOrder;
  invoice: ExtractedInvoice;
  lines: LineMatch[];
  exceptions: MatchException[];
  jev: JevVerdict;
}

export function invoiceReviewResult(state: InvoiceReviewState): JsonValue {
  if (!state.outcome || !state.po || !state.invoice || !state.jev) {
    throw new Error('The invoice review finished without its outcome, PO, invoice or Jev verdict. This is a bug.');
  }
  const result: InvoiceReviewResult = {
    outcome: state.outcome,
    reviewNote: state.reviewNote,
    po: state.po,
    invoice: state.invoice,
    lines: state.lines,
    exceptions: state.exceptions,
    jev: state.jev,
  };
  return result as unknown as JsonValue;
}

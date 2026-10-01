import { Annotation } from '@langchain/langgraph';
import type { WorkflowDocumentRef } from '@orchestrator-ai/transport-types';
import { runtimeStateChannels } from '../shared/runs';
import type { InvoiceOutcome } from './finance-store.service';
import type { ExtractedInvoice, LineMatch, MatchException, PurchaseOrder } from './three-way-match';

export interface JevVerdict {
  decision: 'pass' | 'review' | 'block';
  reason: string | null;
  sameVendor: number | null;
  sameGoods: number | null;
  sameTerms: number | null;
}

/** The partner vendor registry's answer about the invoice's vendor, or why it could not be had. */
export type VendorCheck =
  | { result: 'checked'; partner: string; status: 'approved' | 'on_hold' | 'unknown'; bankDetailsChangedOn: string | null; note: string }
  | { result: 'unverified'; error: string };

export const InvoiceReviewStateAnnotation = Annotation.Root({
  ...runtimeStateChannels,
  poNumber: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  invoiceText: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  documents: Annotation<WorkflowDocumentRef[]>({ reducer: (_, n) => n, default: () => [] }),
  po: Annotation<PurchaseOrder | null>({ reducer: (_, n) => n, default: () => null }),
  invoice: Annotation<ExtractedInvoice | null>({ reducer: (_, n) => n, default: () => null }),
  lines: Annotation<LineMatch[]>({ reducer: (_, n) => n, default: () => [] }),
  exceptions: Annotation<MatchException[]>({ reducer: (_, n) => n, default: () => [] }),
  jev: Annotation<JevVerdict | null>({ reducer: (_, n) => n, default: () => null }),
  vendorCheck: Annotation<VendorCheck | null>({ reducer: (_, n) => n, default: () => null }),
  outcome: Annotation<InvoiceOutcome | null>({ reducer: (_, n) => n, default: () => null }),
  reviewNote: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  reviewRound: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
});

export type InvoiceReviewState = typeof InvoiceReviewStateAnnotation.State;

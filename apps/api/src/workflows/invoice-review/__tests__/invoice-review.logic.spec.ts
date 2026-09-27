import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../../catalog/workflow.registry';
import type { WorkflowDocumentsService } from '../../shared/documents/workflow-documents.service';
import type { FinanceStoreService } from '../finance-store.service';
import { invoiceReviewExporter } from '../invoice-review.exporter';
import { needsReview } from '../invoice-review.graph';
import { parseInvoiceReviewInput } from '../invoice-review.input';
import { invoiceReviewResult } from '../invoice-review.result';
import type { InvoiceReviewState } from '../invoice-review.state';
import { createMatchNode, EXCEPTIONS_STAGE } from '../nodes/match.node';
import { createReadNode } from '../nodes/read.node';
import { createRecordNode } from '../nodes/record.node';
import { createReviewNode } from '../nodes/review.node';
import type { ExtractedInvoice, PurchaseOrder } from '../three-way-match';

const config = { configurable: { reportProgress: async () => undefined } };
const context = createMockExecutionContext({ orgSlug: 'finance', conversationId: 'run-1', agentType: 'workflow' });
const po: PurchaseOrder = {
  poNumber: 'PO-4471', vendor: 'ACME Industrial Supply', terms: 'Net 30', currency: 'USD', budgetOwner: 'Facilities',
  lines: [{ lineNo: 1, description: 'Nitrile exam gloves, box of 100', quantity: 40, unitPrice: 12.5, received: 40 }],
};
const invoice: ExtractedInvoice = {
  vendor: 'ACME Industrial Supply, Inc.', invoiceNumber: 'INV-21150', invoiceDate: '2026-09-25', terms: 'Net 30', currency: 'USD',
  lines: [{ description: 'Nitrile gloves, box of 100', quantity: 40, unitPrice: 12.5 }], total: 500,
};
const state = (over: Partial<InvoiceReviewState> = {}) =>
  ({ executionContext: context, modelProfile: {}, runInstruction: null, poNumber: 'PO-4471', invoiceText: null, documents: [], po, invoice, lines: [], exceptions: [], jev: null, outcome: null, reviewNote: null, reviewRound: 0, ...over }) as InvoiceReviewState;
const jevVerdict = (decision: string) => ({ rubric: 'invoice-po-match', version: 1, decision, reason: decision === 'pass' ? null : 'different vendor', answers: { same_vendor: { type: 'noul', noul: 0.9 } }, model: 'm', usage: { input_tokens: 1, output_tokens: 0 } });

describe('invoice review input', () => {
  it('takes a PO number and optional invoice text', () => {
    expect(parseInvoiceReviewInput({ poNumber: ' PO-4471 ', invoiceText: 'Invoice...' })).toEqual({ poNumber: 'PO-4471', invoiceText: 'Invoice...' });
    expect(parseInvoiceReviewInput({ poNumber: 'PO-4471' }).invoiceText).toBeNull();
    expect(() => parseInvoiceReviewInput({ poNumber: '4471' })).toThrow(WorkflowInputError);
    expect(() => parseInvoiceReviewInput({ poNumber: 'PO-4471', invoiceText: '  ' })).toThrow('as text');
  });
});

describe('read', () => {
  const store = { purchaseOrder: jest.fn(async (_o: string, n: string) => (n === 'PO-4471' ? po : null)) };
  const documents = { text: jest.fn(async () => 'Invoice from the PDF') };
  const node = createReadNode({ store: store as unknown as FinanceStoreService, documents: documents as unknown as WorkflowDocumentsService });

  it('reads the invoice from its one document when no text is given', async () => {
    const doc = { ref: 'finance/run-1/x-inv.pdf', filename: 'inv.pdf', mimeType: 'application/pdf' };
    expect(await node(state({ documents: [doc] }), config)).toEqual({ po, invoiceText: 'Invoice from the PDF' });
    expect(documents.text).toHaveBeenCalledWith(context, doc);
  });

  it('fails on an unknown PO, on neither text nor document, and on both', async () => {
    await expect(node(state({ poNumber: 'PO-9999', invoiceText: 'x' }), config)).rejects.toThrow('no purchase order PO-9999');
    await expect(node(state(), config)).rejects.toThrow('exactly one document');
    await expect(node(state({ invoiceText: 'x', documents: [{ ref: 'r', filename: 'f', mimeType: 'application/pdf' }] }), config)).rejects.toThrow('not both');
  });
});

describe('match, review and record', () => {
  function deps(jevDecision: string, duplicate = false) {
    const units = { runCheck: jest.fn(async () => [jevVerdict(jevDecision)]), runHuman: jest.fn() };
    const store = { isDuplicate: jest.fn(async () => duplicate), record: jest.fn(async () => undefined) };
    const ledger = { raise: jest.fn(async () => undefined), move: jest.fn(async () => undefined) };
    return { units, store, ledger };
  }

  it('passes a clean invoice straight to record, with an empty ledger stage', async () => {
    const d = deps('pass');
    const out = await createMatchNode(d as never)(state(), config);
    expect(out.exceptions).toEqual([]);
    expect(out.jev).toMatchObject({ decision: 'pass', sameVendor: 0.9 });
    expect(d.ledger.raise).toHaveBeenCalledWith(expect.anything(), EXCEPTIONS_STAGE, []);
    expect(needsReview(state({ exceptions: out.exceptions }))).toBe('record');
    await createRecordNode({ store: d.store as unknown as FinanceStoreService })(state({ exceptions: [] }), config);
    expect(d.store.record).toHaveBeenCalledWith('finance', 'run-1', 'PO-4471', invoice, 'auto_approved', []);
  });

  it('turns a duplicate and a Jev block into exceptions on the ledger and routes to review', async () => {
    const d = deps('block', true);
    const out = await createMatchNode(d as never)(state(), config);
    expect(out.exceptions!.map((e) => e.key)).toEqual(['duplicate', 'jev']);
    expect(d.units.runCheck).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ checks: [expect.objectContaining({ rubric: 'invoice-po-match' })] }));
    expect((d.ledger.raise.mock.calls[0] as unknown[])[2]).toHaveLength(2);
    expect(needsReview(state({ exceptions: out.exceptions }))).toBe('review');
  });

  it('records a rejection as the outcome, with each exception accepted as the reason', async () => {
    const d = deps('block');
    d.units.runHuman.mockResolvedValue({ kind: 'decision', decision: { type: 'reject', feedback: 'Wrong vendor entity' } });
    const exceptions = [{ key: 'vendor', code: 'vendor' as const, severity: 'high' as const, detail: 'x', invoiceLine: null }];
    const out = await createReviewNode(d as never)(state({ exceptions, jev: { decision: 'block', reason: 'r', sameVendor: 0, sameGoods: 1, sameTerms: 1 } }), config);
    expect(out).toMatchObject({ outcome: 'rejected', reviewNote: 'Wrong vendor entity', reviewRound: 1 });
    expect(d.ledger.move).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ issueKey: 'vendor', status: 'accepted' })], 'review:approve-invoice#0');
  });

  it('refuses to auto-approve an invoice that has exceptions', async () => {
    const d = deps('pass');
    const exceptions = [{ key: 'terms', code: 'terms' as const, severity: 'medium' as const, detail: 'x', invoiceLine: null }];
    await expect(createRecordNode({ store: d.store as unknown as FinanceStoreService })(state({ exceptions }), config)).rejects.toThrow('bug');
  });
});

describe('result, export and docs', () => {
  it('exports the decision, exceptions and lines', () => {
    const result = invoiceReviewResult(state({ outcome: 'auto_approved', lines: [{ invoiceLine: 1, poLine: 1, similarity: 1 }], jev: { decision: 'pass', reason: null, sameVendor: 1, sameGoods: 1, sameTerms: 1 } }));
    const doc = invoiceReviewExporter.build({ run: { id: 'r', result } as never, issues: {} as never, exportedAt: new Date() });
    expect(doc.title).toBe('Invoice INV-21150 - Approved automatically (clean match)');
    expect(doc.sections.map((s) => s.heading)).toEqual(['Decision', 'Exceptions', 'Lines']);
  });

  it('has a brief, both docs and two examples its parser accepts', async () => {
    const { DEFAULT_WORKFLOW_DOCS_ROOT, WorkflowDocsService } = await import('../../shared/docs/workflow-docs.service');
    const brief = await new WorkflowDocsService(DEFAULT_WORKFLOW_DOCS_ROOT).brief('invoice-review', (i) => parseInvoiceReviewInput(i));
    expect(brief.showcase).toHaveLength(2);
    expect(brief.docs).toEqual(['user-guide', 'smoke-test']);
  });
});

import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { IssueLedgerService, RaisedIssue } from '../../shared/ledger';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { FinanceStoreService } from '../finance-store.service';
import type { InvoiceReviewState, JevVerdict } from '../invoice-review.state';
import { threeWayMatch, type ExtractedInvoice, type MatchException, type PurchaseOrder } from '../three-way-match';

/** The ledger stage that holds the invoice's exceptions. */
export const EXCEPTIONS_STAGE = 'invoice-exceptions';

export function describeInvoice(i: ExtractedInvoice): string {
  const lines = i.lines.map((l) => `${l.quantity} x ${l.description} @ ${l.unitPrice}`).join('; ');
  return `Vendor: ${i.vendor}. Invoice ${i.invoiceNumber}${i.invoiceDate ? `, ${i.invoiceDate}` : ''}. Terms: ${i.terms ?? 'not stated'}, ${i.currency}. Lines: ${lines}. Total: ${i.total}.`;
}

export function describePo(p: PurchaseOrder): string {
  const lines = p.lines.map((l) => `${l.quantity} x ${l.description} @ ${l.unitPrice} (received ${l.received})`).join('; ');
  return `${p.poNumber} to ${p.vendor}. Terms ${p.terms}, ${p.currency}. Lines: ${lines}.`;
}

/** Jev's verdict as an exception when it is not a pass. */
export function jevException(v: JevVerdict): MatchException | null {
  if (v.decision === 'pass') return null;
  return { key: 'jev', code: 'jev', severity: v.decision === 'block' ? 'high' : 'medium', detail: `Jev: ${v.reason ?? v.decision}`, invoiceLine: null };
}

/** The three-way match in code, then Jev on what code cannot judge; every exception goes on the ledger. */
export function createMatchNode(deps: { units: WorkUnitService; store: FinanceStoreService; ledger: IssueLedgerService }) {
  return async (state: InvoiceReviewState, config: LangGraphRunnableConfig): Promise<Partial<InvoiceReviewState>> => {
    const context = state.executionContext;
    const invoice = state.invoice!;
    const po = state.po!;
    await reportProgress(config, 'match', 50, `Matching the invoice against ${po.poNumber} and its receipts`);
    const duplicate = await deps.store.isDuplicate(context.orgSlug, invoice, context.conversationId);
    const { lines, exceptions } = threeWayMatch(invoice, po, duplicate);

    const [verdict] = await deps.units.runCheck(scopeOf(state), {
      slug: 'jev-invoice-po-match',
      checks: [{ rubric: 'invoice-po-match', inputs: { invoice: describeInvoice(invoice), purchase_order: describePo(po) } }],
    });
    const noul = (q: string) => (typeof verdict!.answers[q]?.noul === 'number' ? verdict!.answers[q]!.noul! : null);
    const jev: JevVerdict = { decision: verdict!.decision, reason: verdict!.reason ?? null, sameVendor: noul('same_vendor'), sameGoods: noul('same_goods'), sameTerms: noul('same_terms') };
    const all = [...exceptions, ...(jevException(jev) ? [jevException(jev)!] : [])];

    await deps.ledger.raise(
      scopeOf(state),
      EXCEPTIONS_STAGE,
      all.map<RaisedIssue>((e) => ({
        issueKey: e.key,
        source: e.code === 'jev' ? 'jev:invoice-po-match' : 'three-way-match',
        severity: e.severity,
        category: e.code,
        title: e.code.replace(/_/g, ' '),
        finding: e.detail,
        subject: { invoiceLine: e.invoiceLine },
      })),
    );
    return { lines, exceptions: all, jev };
  };
}

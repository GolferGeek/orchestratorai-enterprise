import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { IssueLedgerService } from '../../shared/ledger';
import type { HumanGate } from '../../shared/reviews';
import { routeAfterDecision } from '../../shared/reviews';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { InvoiceReviewState } from '../invoice-review.state';
import { EXCEPTIONS_STAGE } from './match.node';

/** The budget owner approves the invoice despite its exceptions, or rejects it (a recorded outcome, not a failure). */
export const INVOICE_GATE: Extract<HumanGate, { kind: 'approval' }> = {
  slug: 'approve-invoice',
  kind: 'approval',
  allowedDecisions: ['approve', 'reject'],
  allowItemDecisions: false,
  onReject: 'record',
  taskTitle: 'Invoice exceptions to review',
};

/**
 * The human gate (only when there are exceptions). Approving pays the invoice
 * despite them (each exception is kept on the ledger as report-only);
 * rejecting records the rejection (each exception accepted as the reason).
 */
export function createReviewNode(deps: { units: WorkUnitService; ledger: IssueLedgerService }) {
  return async (state: InvoiceReviewState, config: LangGraphRunnableConfig): Promise<Partial<InvoiceReviewState>> => {
    const invoice = state.invoice!;
    const round = state.reviewRound;
    const response = await deps.units.runHuman(scopeOf(state), {
      slug: 'review-exceptions',
      gate: INVOICE_GATE,
      round,
      payload: {
        poNumber: state.poNumber,
        vendor: invoice.vendor,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        currency: invoice.currency,
        budgetOwner: state.po!.budgetOwner,
        jev: { decision: state.jev!.decision, reason: state.jev!.reason },
        items: state.exceptions.map((e) => ({ itemId: e.key, code: e.code, severity: e.severity, detail: e.detail })),
      },
    });
    const route = routeAfterDecision(INVOICE_GATE, response);
    if (route !== 'approved' && route !== 'record') throw new Error(`The invoice review ended with "${route}", which this gate does not allow.`);
    const decision = response.kind === 'decision' ? response.decision : null;
    const note = decision && 'feedback' in decision && decision.feedback ? decision.feedback : null;
    const approved = route === 'approved';
    await deps.ledger.move(
      scopeOf(state),
      state.exceptions.map((e) => ({
        stageSlug: EXCEPTIONS_STAGE,
        issueKey: e.key,
        status: approved ? ('report_only' as const) : ('accepted' as const),
        rationale: approved ? `Approved despite this${note ? `: ${note}` : ''}` : `Invoice rejected${note ? `: ${note}` : ''}`,
      })),
      `review:${INVOICE_GATE.slug}#${round}`,
    );
    await reportProgress(config, 'review', 85, approved ? 'Approved by the reviewer' : 'Rejected by the reviewer');
    return { outcome: approved ? 'approved' : 'rejected', reviewNote: note, reviewRound: round + 1 };
  };
}

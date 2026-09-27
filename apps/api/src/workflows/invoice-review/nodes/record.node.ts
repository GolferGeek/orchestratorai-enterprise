import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import type { FinanceStoreService } from '../finance-store.service';
import type { InvoiceReviewState } from '../invoice-review.state';

/** Record the decision in finance.invoices; a clean invoice reaching here was approved automatically. */
export function createRecordNode(deps: { store: FinanceStoreService }) {
  return async (state: InvoiceReviewState, config: LangGraphRunnableConfig): Promise<Partial<InvoiceReviewState>> => {
    const outcome = state.outcome ?? 'auto_approved';
    if (outcome === 'auto_approved' && state.exceptions.length > 0) {
      throw new Error('An invoice with exceptions reached the record step without a review. This is a bug.');
    }
    const context = state.executionContext;
    await deps.store.record(context.orgSlug, context.conversationId, state.poNumber, state.invoice!, outcome, state.exceptions);
    await reportProgress(config, 'record', 95, `Recorded: ${outcome.replace('_', ' ')}`);
    return { outcome };
  };
}

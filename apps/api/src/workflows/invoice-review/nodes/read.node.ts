import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { WorkflowDocumentsService } from '../../shared/documents/workflow-documents.service';
import { reportProgress } from '../../shared/runs';
import type { FinanceStoreService } from '../finance-store.service';
import type { InvoiceReviewState } from '../invoice-review.state';

/** The purchase order (with receipts) and the invoice's text: pasted, or read from the one uploaded document. */
export function createReadNode(deps: { store: FinanceStoreService; documents: WorkflowDocumentsService }) {
  return async (state: InvoiceReviewState, config: LangGraphRunnableConfig): Promise<Partial<InvoiceReviewState>> => {
    const context = state.executionContext;
    await reportProgress(config, 'read', 10, `Loading ${state.poNumber} and the invoice`);
    const po = await deps.store.purchaseOrder(context.orgSlug, state.poNumber);
    if (!po) throw new Error(`Finance has no purchase order ${state.poNumber}`);
    if (state.invoiceText && state.documents.length > 0) throw new Error('Give the invoice as text or as one document, not both');
    if (!state.invoiceText && state.documents.length !== 1) throw new Error('Give the invoice as text or as exactly one document');
    const invoiceText = state.invoiceText ?? (await deps.documents.text(context, state.documents[0]!));
    return { po, invoiceText };
  };
}

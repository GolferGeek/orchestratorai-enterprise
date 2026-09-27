import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { InvoiceReviewState } from '../invoice-review.state';
import type { ExtractedInvoice } from '../three-way-match';

/** The invoice's fields, copied by the extractor agent (its contract enforces the shape). */
export function createExtractNode(deps: { units: WorkUnitService }) {
  return async (state: InvoiceReviewState, config: LangGraphRunnableConfig): Promise<Partial<InvoiceReviewState>> => {
    await reportProgress(config, 'extract', 25, 'Reading the invoice');
    const invoice = await deps.units.runSolo<ExtractedInvoice>(scopeOf(state), {
      slug: 'extract-invoice',
      agent: 'invoice-extractor',
      input: { invoiceText: state.invoiceText! },
    });
    return { invoice: { ...invoice, currency: invoice.currency.toUpperCase() } };
  };
}

import type { JsonValue } from '@orchestrator-ai/transport-types';
import { t, type ExportDocument, type WorkflowExporter } from '../shared/export';
import { INVOICE_REVIEW_SLUG } from './invoice-review.input';
import type { InvoiceReviewResult } from './invoice-review.result';

const OUTCOMES = { auto_approved: 'Approved automatically (clean match)', approved: 'Approved by the reviewer', rejected: 'Rejected by the reviewer' } as const;

function read(result: JsonValue | null): InvoiceReviewResult {
  const r = result as Partial<InvoiceReviewResult> | null;
  if (!r || !r.outcome || !r.invoice || !r.po || !Array.isArray(r.exceptions)) throw new Error('This review has no complete result to export.');
  return r as InvoiceReviewResult;
}

export const invoiceReviewExporter: WorkflowExporter = {
  slug: INVOICE_REVIEW_SLUG,
  fileName: ({ run }) => {
    const r = read(run.result);
    return `invoice-${r.invoice.invoiceNumber.replace(/[^\w-]+/g, '-')}-${r.po.poNumber}`;
  },
  build: ({ run, exportedAt }): ExportDocument => {
    const r = read(run.result);
    return {
      title: `Invoice ${r.invoice.invoiceNumber} - ${OUTCOMES[r.outcome]}`,
      generatedAt: exportedAt.toISOString(),
      metadata: [
        { label: 'Vendor', value: r.invoice.vendor },
        { label: 'Purchase order', value: r.po.poNumber },
        { label: 'Total', value: `${r.invoice.total.toFixed(2)} ${r.invoice.currency}` },
        { label: 'Run', value: run.id },
      ],
      sections: [
        {
          heading: 'Decision',
          level: 2,
          blocks: [
            { kind: 'definition', label: 'Outcome', value: OUTCOMES[r.outcome] },
            ...(r.reviewNote ? [{ kind: 'definition' as const, label: 'Reviewer note', value: r.reviewNote }] : []),
            { kind: 'definition', label: 'Jev (invoice-po-match)', value: `${r.jev.decision}${r.jev.reason ? ` - ${r.jev.reason}` : ''}` },
          ],
        },
        {
          heading: 'Exceptions',
          level: 2,
          blocks: r.exceptions.length
            ? [{ kind: 'bullets', items: r.exceptions.map((e) => ({ runs: [t(`${e.severity.toUpperCase()} ${e.code.replace(/_/g, ' ')}: ${e.detail}`)] })) }]
            : [{ kind: 'paragraph', runs: [t('None: the invoice matches the purchase order and its receipts.')] }],
        },
        {
          heading: 'Lines',
          level: 2,
          blocks: [{
            kind: 'table',
            headers: ['Invoice line', 'Qty', 'Price', 'PO line', 'PO price', 'Received'],
            rows: r.lines.map((m) => {
              const line = r.invoice.lines[m.invoiceLine - 1]!;
              const po = r.po.lines.find((p) => p.lineNo === m.poLine);
              return { cells: [line.description, String(line.quantity), line.unitPrice.toFixed(2), po ? po.description : 'not on the PO', po ? po.unitPrice.toFixed(2) : '-', po ? String(po.received) : '-'].map((v) => ({ runs: [t(v)] })) };
            }),
          }],
        },
      ],
      footer: 'Three-way match per FIN-POL-004; vendor and goods equivalence checked by Jev.',
    };
  },
};

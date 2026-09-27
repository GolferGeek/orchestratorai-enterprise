import type { JsonValue } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../catalog/workflow.registry';

export const INVOICE_REVIEW_SLUG = 'invoice-review';
export const MAX_INVOICE_TEXT = 20000;

/** `start` input: { poNumber, invoiceText? } - the invoice as text, or as one uploaded document. */
export interface InvoiceReviewInput {
  poNumber: string;
  invoiceText: string | null;
}

export function parseInvoiceReviewInput(input: JsonValue): InvoiceReviewInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new WorkflowInputError('input must be an object with poNumber');
  const extra = Object.keys(input).filter((k) => k !== 'poNumber' && k !== 'invoiceText');
  if (extra.length) throw new WorkflowInputError(`input has unknown fields: ${extra.join(', ')}`);
  const { poNumber, invoiceText } = input;
  if (typeof poNumber !== 'string' || !/^PO-\d{3,8}$/.test(poNumber.trim())) throw new WorkflowInputError('input.poNumber must look like PO-1234');
  if (invoiceText !== undefined && invoiceText !== null) {
    if (typeof invoiceText !== 'string' || !invoiceText.trim()) throw new WorkflowInputError('input.invoiceText must be the invoice as text');
    if (invoiceText.length > MAX_INVOICE_TEXT) throw new WorkflowInputError(`input.invoiceText must be at most ${MAX_INVOICE_TEXT} characters`);
  }
  return { poNumber: poNumber.trim(), invoiceText: typeof invoiceText === 'string' ? invoiceText.trim() : null };
}

export function invoiceReviewRunTitle(input: JsonValue): string {
  return `Invoice against ${parseInvoiceReviewInput(input).poNumber}`;
}

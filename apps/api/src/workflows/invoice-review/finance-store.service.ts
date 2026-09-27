import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import type { ExtractedInvoice, MatchException, PurchaseOrder } from './three-way-match';
import { vendorKey } from './three-way-match';

type Row = Record<string, unknown>;

export type InvoiceOutcome = 'auto_approved' | 'approved' | 'rejected';

/** Finance's purchase orders, receipts and invoice decisions. */
@Injectable()
export class FinanceStoreService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async purchaseOrders(organizationSlug: string): Promise<Array<{ poNumber: string; vendor: string; budgetOwner: string }>> {
    const rows = await this.rows(this.db.from('finance', 'purchase_orders').select('po_number, vendor, budget_owner').eq('organization_slug', organizationSlug).order('po_number'), 'purchase orders');
    return rows.map((r) => ({ poNumber: String(r.po_number), vendor: String(r.vendor), budgetOwner: String(r.budget_owner) }));
  }

  /** The PO with its lines and what was received on each; null if the org has no such PO. */
  async purchaseOrder(organizationSlug: string, poNumber: string): Promise<PurchaseOrder | null> {
    const [po] = await this.rows(this.db.from('finance', 'purchase_orders').select('*').eq('organization_slug', organizationSlug).eq('po_number', poNumber), `PO ${poNumber}`);
    if (!po) return null;
    const lines = await this.rows(this.db.from('finance', 'po_lines').select('*').eq('po_id', po.id).order('line_no'), `lines of ${poNumber}`);
    const receipts = await this.rows(this.db.from('finance', 'receipts').select('line_no, quantity').eq('po_id', po.id), `receipts of ${poNumber}`);
    return {
      poNumber: String(po.po_number),
      vendor: String(po.vendor),
      terms: String(po.terms),
      currency: String(po.currency),
      budgetOwner: String(po.budget_owner),
      lines: lines.map((l) => ({
        lineNo: Number(l.line_no),
        description: String(l.description),
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        received: receipts.filter((r) => Number(r.line_no) === Number(l.line_no)).reduce((sum, r) => sum + Number(r.quantity), 0),
      })),
    };
  }

  /** An invoice with this vendor and number was already decided or paid (by another run, or before runs). */
  async isDuplicate(organizationSlug: string, invoice: ExtractedInvoice, runId: string): Promise<boolean> {
    const rows = await this.rows(
      this.db.from('finance', 'invoices').select('run_id, outcome').eq('organization_slug', organizationSlug)
        .eq('vendor_key', vendorKey(invoice.vendor)).eq('invoice_number', invoice.invoiceNumber),
      'earlier invoices',
    );
    return rows.some((r) => r.run_id !== runId && r.outcome !== 'rejected');
  }

  /** The run's decision, once (a retried step finds it already recorded). */
  async record(organizationSlug: string, runId: string, poNumber: string, invoice: ExtractedInvoice, outcome: InvoiceOutcome, exceptions: MatchException[]): Promise<void> {
    const existing = await this.rows(this.db.from('finance', 'invoices').select('outcome').eq('run_id', runId), 'this run\'s decision');
    if (existing.length > 0) {
      if (existing[0]!.outcome !== outcome) throw new Error(`Run ${runId} already recorded "${String(existing[0]!.outcome)}", not "${outcome}"`);
      return;
    }
    const { error } = await this.db.from('finance', 'invoices').insert({
      organization_slug: organizationSlug,
      run_id: runId,
      po_number: poNumber,
      vendor: invoice.vendor,
      vendor_key: vendorKey(invoice.vendor),
      invoice_number: invoice.invoiceNumber,
      invoice_date: invoice.invoiceDate,
      total: invoice.total,
      currency: invoice.currency,
      outcome,
      exceptions,
    });
    if (error) throw new Error(`Failed to record the invoice decision: ${error.message}`);
  }

  private async rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<Row[]> {
    const { data, error } = await query;
    if (error) throw new Error(`Failed to read ${what}: ${error.message}`);
    return data as Row[];
  }
}

import { matchLines, threeWayMatch, vendorKey, type ExtractedInvoice, type PurchaseOrder } from '../three-way-match';

const po: PurchaseOrder = {
  poNumber: 'PO-4502',
  vendor: 'Summit Office Interiors LLC',
  terms: 'Net 45',
  currency: 'USD',
  budgetOwner: 'Workplace',
  lines: [
    { lineNo: 1, description: 'Ergonomic task chair, mesh back', quantity: 12, unitPrice: 389, received: 12 },
    { lineNo: 2, description: 'Height-adjustable desk, 60 inch', quantity: 12, unitPrice: 649, received: 8 },
  ],
};

const invoice = (overrides: Partial<ExtractedInvoice> = {}): ExtractedInvoice => ({
  vendor: 'Summit Office Interiors, L.L.C.',
  invoiceNumber: 'SOI-7781',
  invoiceDate: '2026-09-20',
  terms: 'Net 45',
  currency: 'USD',
  lines: [
    { description: 'Task chair - ergonomic, mesh', quantity: 12, unitPrice: 389 },
    { description: 'Desk, height adjustable 60"', quantity: 8, unitPrice: 649 },
  ],
  total: 9860,
  ...overrides,
});

const codes = (i: ExtractedInvoice, duplicate = false) => threeWayMatch(i, po, duplicate).exceptions.map((e) => e.key);

describe('three-way match', () => {
  it('passes a clean invoice with differently worded names and lines', () => {
    expect(vendorKey('Summit Office Interiors, L.L.C.')).toBe(vendorKey('Summit Office Interiors LLC'));
    expect(matchLines(invoice().lines, po.lines).map((m) => m.poLine)).toEqual([1, 2]);
    expect(codes(invoice())).toEqual([]);
  });

  it('allows 2% or USD 50 per line, whichever is smaller', () => {
    // 12 chairs at 392: +36 on a 4,668 line; the cap is min(93.36, 50) = 50.
    expect(codes(invoice({ lines: [{ description: 'Task chair ergonomic mesh', quantity: 12, unitPrice: 392 }, invoice().lines[1]!], total: 9896 }))).toEqual([]);
    // 12 chairs at 405: +192, over 50.
    expect(codes(invoice({ lines: [{ description: 'Task chair ergonomic mesh', quantity: 12, unitPrice: 405 }, invoice().lines[1]!], total: 10052 }))).toEqual(['price_variance:line-1']);
  });

  it('flags billing beyond receipt, lines not on the PO, a total over the PO, and arithmetic that does not add up', () => {
    const over = invoice({
      lines: [invoice().lines[0]!, { description: 'Desk, height adjustable 60"', quantity: 12, unitPrice: 649 }, { description: 'White-glove installation', quantity: 1, unitPrice: 900 }],
      total: 13356,
    });
    expect(codes(over)).toEqual(['quantity_exceeds_receipt:line-2', 'not_on_po:line-3', 'total_over_po']);
    expect(codes(invoice({ total: 9999 }))).toEqual(['lines_do_not_add_up']);
  });

  it('flags the vendor, terms, currency and a duplicate', () => {
    expect(codes(invoice({ vendor: 'Summit Workspace Holdings' }))).toEqual(['vendor']);
    expect(codes(invoice({ terms: 'Due on receipt' }))).toEqual(['terms']);
    expect(codes(invoice({ terms: null }))).toEqual([]);
    expect(codes(invoice({ currency: 'EUR' }))).toEqual(['currency']);
    expect(codes(invoice(), true)).toEqual(['duplicate']);
  });
});

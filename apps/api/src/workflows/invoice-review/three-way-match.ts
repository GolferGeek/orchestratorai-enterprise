/**
 * The three-way match (FIN-POL-004): invoice against purchase order and
 * receiving record. Pure arithmetic and comparison - no model. What code
 * cannot judge (differently worded vendor names and line descriptions) goes
 * to Jev's invoice-po-match rubric afterwards.
 */
export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface ExtractedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  terms: string | null;
  currency: string;
  lines: InvoiceLine[];
  total: number;
}

export interface PoLine {
  lineNo: number;
  description: string;
  quantity: number;
  unitPrice: number;
  received: number;
}

export interface PurchaseOrder {
  poNumber: string;
  vendor: string;
  terms: string;
  currency: string;
  budgetOwner: string;
  lines: PoLine[];
}

export type ExceptionCode =
  | 'duplicate'
  | 'vendor'
  | 'not_on_po'
  | 'price_variance'
  | 'quantity_exceeds_receipt'
  | 'total_over_po'
  | 'lines_do_not_add_up'
  | 'terms'
  | 'currency'
  | 'jev';

export interface MatchException {
  /** Stable per invoice: `${code}` or `${code}:line-${n}`. */
  key: string;
  code: ExceptionCode;
  severity: 'high' | 'medium';
  detail: string;
  invoiceLine: number | null;
}

export interface LineMatch {
  invoiceLine: number;
  poLine: number | null;
  similarity: number;
}

/** Price tolerance per line: 2% of the line or USD 50, whichever is smaller. */
export const PRICE_TOLERANCE_RATE = 0.02;
export const PRICE_TOLERANCE_CAP = 50;
/** Freight and rounding allowed over the matched PO value. */
export const TOTAL_TOLERANCE = 250;

const SUFFIXES = new Set(['inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'plc', 'gmbh']);

/** A vendor name without case, punctuation or legal suffixes. */
export function vendorKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w))
    .join(' ');
}

const words = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));

function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}

/** Each invoice line to the most similar unused PO line (at least 0.3 of the shorter's words shared). */
export function matchLines(invoice: InvoiceLine[], po: PoLine[]): LineMatch[] {
  const used = new Set<number>();
  return invoice.map((line, index) => {
    let best: { poLine: number; similarity: number } | null = null;
    for (const p of po) {
      if (used.has(p.lineNo)) continue;
      const s = similarity(line.description, p.description);
      if (s >= 0.3 && (!best || s > best.similarity)) best = { poLine: p.lineNo, similarity: s };
    }
    if (best) used.add(best.poLine);
    return { invoiceLine: index + 1, poLine: best?.poLine ?? null, similarity: best?.similarity ?? 0 };
  });
}

const money = (n: number) => Math.round(n * 100) / 100;
const normalTerms = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

export function threeWayMatch(invoice: ExtractedInvoice, po: PurchaseOrder, duplicate: boolean): { lines: LineMatch[]; exceptions: MatchException[] } {
  const exceptions: MatchException[] = [];
  const add = (code: ExceptionCode, severity: MatchException['severity'], detail: string, invoiceLine: number | null = null) =>
    exceptions.push({ key: invoiceLine === null ? code : `${code}:line-${invoiceLine}`, code, severity, detail, invoiceLine });

  if (duplicate) add('duplicate', 'high', `Invoice ${invoice.invoiceNumber} from this vendor has already been paid or decided.`);
  if (vendorKey(invoice.vendor) !== vendorKey(po.vendor)) {
    add('vendor', 'high', `Invoice is from "${invoice.vendor}"; the PO was issued to "${po.vendor}".`);
  }
  if (invoice.currency !== po.currency) add('currency', 'medium', `Invoice is in ${invoice.currency}; the PO is in ${po.currency}.`);
  if (invoice.terms !== null && normalTerms(invoice.terms) !== normalTerms(po.terms)) {
    add('terms', 'medium', `Invoice terms "${invoice.terms}"; the PO sets "${po.terms}".`);
  }

  const lines = matchLines(invoice.lines, po.lines);
  let matchedValue = 0;
  for (const match of lines) {
    const line = invoice.lines[match.invoiceLine - 1]!;
    const poLine = po.lines.find((p) => p.lineNo === match.poLine);
    if (!poLine) {
      add('not_on_po', 'high', `"${line.description}" (${line.quantity} x ${line.unitPrice}) is not on the PO.`, match.invoiceLine);
      continue;
    }
    matchedValue += poLine.unitPrice * line.quantity;
    const variance = money((line.unitPrice - poLine.unitPrice) * line.quantity);
    const tolerance = Math.min(PRICE_TOLERANCE_RATE * poLine.unitPrice * line.quantity, PRICE_TOLERANCE_CAP);
    if (Math.abs(variance) > tolerance + 0.005) {
      add('price_variance', 'medium', `"${line.description}": ${line.unitPrice} vs PO ${poLine.unitPrice} each - ${variance > 0 ? '+' : ''}${variance.toFixed(2)} on the line (tolerance ${tolerance.toFixed(2)}).`, match.invoiceLine);
    }
    if (line.quantity > poLine.received) {
      add('quantity_exceeds_receipt', 'medium', `"${line.description}": billed ${line.quantity}, received ${poLine.received}.`, match.invoiceLine);
    }
  }

  const linesTotal = money(invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
  if (Math.abs(linesTotal - invoice.total) > 0.01) {
    add('lines_do_not_add_up', 'medium', `The lines add up to ${linesTotal.toFixed(2)}; the invoice total is ${invoice.total.toFixed(2)}.`);
  }
  const over = money(invoice.total - matchedValue);
  if (over > TOTAL_TOLERANCE) {
    add('total_over_po', 'medium', `Total ${invoice.total.toFixed(2)} is ${over.toFixed(2)} over the matched PO value ${money(matchedValue).toFixed(2)} (allowed ${TOTAL_TOLERANCE}).`);
  }
  return { lines, exceptions };
}

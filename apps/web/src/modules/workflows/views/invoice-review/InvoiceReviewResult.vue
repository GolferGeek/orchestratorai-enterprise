<template>
  <div class="inv">
    <p :class="['outcome', `outcome--${result.outcome}`]">{{ OUTCOMES[result.outcome] }}</p>
    <p v-if="result.reviewNote" class="note">Reviewer: {{ result.reviewNote }}</p>
    <div class="facts">
      <div><span>Vendor</span>{{ result.invoice.vendor }}</div>
      <div><span>Invoice</span>{{ result.invoice.invoiceNumber }}{{ result.invoice.invoiceDate ? ` · ${result.invoice.invoiceDate}` : '' }}</div>
      <div><span>Total</span>{{ money(result.invoice.total) }} {{ result.invoice.currency }}</div>
      <div><span>PO</span>{{ result.po.poNumber }} · {{ result.po.vendor }} · {{ result.po.terms }}</div>
      <div><span>Jev</span>{{ result.jev.decision }}{{ result.jev.reason ? ` - ${result.jev.reason}` : '' }}</div>
    </div>
    <h4>Exceptions</h4>
    <p v-if="!result.exceptions.length" class="note">None - the invoice matches the PO and its receipts.</p>
    <ul v-else class="exceptions">
      <li v-for="e in result.exceptions" :key="e.key">
        <span :class="['sev', `sev--${e.severity}`]">{{ e.severity }}</span> <strong>{{ e.code.replace(/_/g, ' ') }}</strong> - {{ e.detail }}
      </li>
    </ul>
    <h4>Lines</h4>
    <table>
      <thead><tr><th>Invoice line</th><th>Qty</th><th>Price</th><th>PO line</th><th>PO price</th><th>Received</th></tr></thead>
      <tbody>
        <tr v-for="m in result.lines" :key="m.invoiceLine" :class="{ flagged: flagged(m.invoiceLine) }">
          <td>{{ line(m).description }}</td>
          <td>{{ line(m).quantity }}</td>
          <td>{{ money(line(m).unitPrice) }}</td>
          <td>{{ poLine(m)?.description ?? 'not on the PO' }}</td>
          <td>{{ poLine(m) ? money(poLine(m)!.unitPrice) : '-' }}</td>
          <td>{{ poLine(m)?.received ?? '-' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script lang="ts" setup>
/** A completed invoice review (invoice-review.result.ts). */
export interface InvoiceReviewRunResult {
  outcome: 'auto_approved' | 'approved' | 'rejected';
  reviewNote: string | null;
  po: { poNumber: string; vendor: string; terms: string; lines: Array<{ lineNo: number; description: string; unitPrice: number; received: number }> };
  invoice: { vendor: string; invoiceNumber: string; invoiceDate: string | null; currency: string; total: number; lines: Array<{ description: string; quantity: number; unitPrice: number }> };
  lines: Array<{ invoiceLine: number; poLine: number | null }>;
  exceptions: Array<{ key: string; code: string; severity: 'high' | 'medium'; detail: string; invoiceLine: number | null }>;
  jev: { decision: string; reason: string | null };
}

const props = defineProps<{ result: InvoiceReviewRunResult }>();

const OUTCOMES = { auto_approved: 'Approved automatically - a clean match', approved: 'Approved by the reviewer', rejected: 'Rejected by the reviewer' };
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const line = (m: { invoiceLine: number }) => props.result.invoice.lines[m.invoiceLine - 1]!;
const poLine = (m: { poLine: number | null }) => props.result.po.lines.find((p) => p.lineNo === m.poLine);
const flagged = (n: number) => props.result.exceptions.some((e) => e.invoiceLine === n);
</script>

<style scoped>
.inv { display: flex; flex-direction: column; gap: 8px; }
.outcome { margin: 0; font-size: 18px; font-weight: 600; }
.outcome--auto_approved, .outcome--approved { color: var(--ion-color-success); }
.outcome--rejected { color: var(--ion-color-danger); }
.note { margin: 0; color: var(--ion-color-medium); }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 6px 16px; font-size: 13px; }
.facts span { display: block; font-size: 11px; text-transform: uppercase; color: var(--ion-color-medium); }
h4 { margin: 10px 0 0; }
.exceptions { margin: 0; padding-left: 18px; font-size: 13px; }
.sev { font-size: 11px; font-weight: 600; text-transform: uppercase; }
.sev--high { color: var(--ion-color-danger); }
.sev--medium { color: var(--ion-color-warning-shade); }
table { border-collapse: collapse; font-size: 13px; }
th, td { padding: 4px 10px 4px 0; text-align: left; }
th { font-size: 11px; text-transform: uppercase; color: var(--ion-color-medium); }
tr.flagged td { color: var(--ion-color-danger); }
</style>

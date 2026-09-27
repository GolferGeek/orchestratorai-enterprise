<template>
  <RuntimeWorkflowPage
    slug="invoice-review"
    name="Invoice Exception Review"
    intro="Match an invoice to its purchase order and what was received. Clean invoices are approved on the spot; exceptions go to the budget owner with the reason."
    route-name="InvoiceReview"
    :run-title="title"
    exportable
  >
    <template #form="{ start, upload, busy, blocked, example }">
      <InvoiceReviewForm :busy="busy" :blocked="!!blocked" :example="example" :upload="upload" @start="(input, docs) => start(input, docs)" />
    </template>
    <template #result="{ result }">
      <InvoiceReviewResult :result="result as unknown as InvoiceReviewRunResult" />
    </template>
    <template #review-item="{ item }">
      <div class="exception">
        <span :class="['sev', `sev--${item.severity}`]">{{ item.severity }}</span>
        <strong>{{ String(item.code).replace(/_/g, ' ') }}</strong>
        <p>{{ item.detail }}</p>
      </div>
    </template>
  </RuntimeWorkflowPage>
</template>

<script lang="ts" setup>
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { RuntimeWorkflowPage } from '@/modules/workflows/kit';
import InvoiceReviewForm from './InvoiceReviewForm.vue';
import InvoiceReviewResult, { type InvoiceReviewRunResult } from './InvoiceReviewResult.vue';

function title(input: JsonValue): string {
  return `Invoice against ${(input as { poNumber?: string }).poNumber ?? 'a PO'}`;
}
</script>

<style scoped>
.exception p { margin: 4px 0 0; }
.sev { font-size: 11px; font-weight: 600; text-transform: uppercase; margin-right: 6px; }
.sev--high { color: var(--ion-color-danger); }
.sev--medium { color: var(--ion-color-warning-shade); }
</style>

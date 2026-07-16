<template>
  <span :class="['dd-badge', badgeClass]" :title="title">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  documentType: string;
}>();

interface TypeMeta {
  label: string;
  bucket: 'legal' | 'financial' | 'other';
}

const TYPE_MAP: Record<string, TypeMeta> = {
  // Legal
  contract: { label: 'Contract', bucket: 'legal' },
  nda: { label: 'NDA', bucket: 'legal' },
  employment_agreement: { label: 'Employment', bucket: 'legal' },
  lease: { label: 'Lease', bucket: 'legal' },
  ip_assignment: { label: 'IP Assignment', bucket: 'legal' },
  privacy_policy: { label: 'Privacy Policy', bucket: 'legal' },
  corporate_governance: { label: 'Corporate Governance', bucket: 'legal' },
  regulatory_filing: { label: 'Regulatory Filing', bucket: 'legal' },
  insurance_policy: { label: 'Insurance', bucket: 'legal' },
  litigation: { label: 'Litigation', bucket: 'legal' },
  amendment: { label: 'Amendment', bucket: 'legal' },
  schedule: { label: 'Schedule', bucket: 'legal' },
  exhibit: { label: 'Exhibit', bucket: 'legal' },

  // Financial (DD Financial Analysis — 2026-04)
  balance_sheet: { label: 'Balance Sheet', bucket: 'financial' },
  profit_and_loss: { label: 'P&L', bucket: 'financial' },
  cash_flow: { label: 'Cash Flow', bucket: 'financial' },
  cap_table: { label: 'Cap Table', bucket: 'financial' },
  debt_schedule: { label: 'Debt Schedule', bucket: 'financial' },
  audit_letter: { label: 'Audit Letter', bucket: 'financial' },
  projections: { label: 'Projections', bucket: 'financial' },
  board_deck: { label: 'Board Deck', bucket: 'financial' },
};

const meta = computed<TypeMeta>(() => {
  const normalized = props.documentType.toLowerCase().replace(/[- ]/g, '_');
  return TYPE_MAP[normalized] ?? { label: props.documentType, bucket: 'other' };
});

const label = computed(() => meta.value.label);
const badgeClass = computed(() => `bucket-${meta.value.bucket}`);
const title = computed(() => `${props.documentType} (${meta.value.bucket})`);
</script>

<style scoped>
.dd-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  border: 1px solid transparent;
}

.bucket-legal {
  background: rgba(56, 128, 255, 0.1);
  color: var(--ion-color-primary, #3880ff);
  border-color: rgba(56, 128, 255, 0.35);
}

.bucket-financial {
  background: rgba(45, 211, 111, 0.12);
  color: var(--ion-color-success, #2dd36f);
  border-color: rgba(45, 211, 111, 0.4);
}

.bucket-other {
  background: rgba(146, 148, 156, 0.12);
  color: var(--ion-color-medium, #92949c);
  border-color: rgba(146, 148, 156, 0.35);
}
</style>

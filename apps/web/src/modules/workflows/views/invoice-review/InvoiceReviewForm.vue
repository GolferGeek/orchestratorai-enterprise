<template>
  <form class="form" @submit.prevent="submit">
    <label class="field">
      <span>Purchase order</span>
      <select v-model="poNumber" :disabled="blocked || busy">
        <option value="" disabled>Choose the PO this invoice bills...</option>
        <option v-for="po in pos" :key="po.poNumber" :value="po.poNumber">{{ po.poNumber }} - {{ po.vendor }} ({{ po.budgetOwner }})</option>
      </select>
      <span v-if="loadError" class="note problem">{{ loadError }}</span>
    </label>
    <DocumentOrText label="Invoice" :disabled="blocked || busy" :example-text="exampleText" @change="(v) => (doc = v)" />
    <ion-button type="submit" :disabled="!ready">{{ busy ? 'Starting...' : 'Review the invoice' }}</ion-button>
  </form>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue, WorkflowDocumentRef } from '@orchestrator-ai/transport-types';
import { apiFetch } from '@/modules/workflows/services/workflows-api.service';
import { DocumentOrText } from '@/modules/workflows/kit';

const props = defineProps<{
  busy: boolean;
  blocked: boolean;
  example: JsonValue | null;
  upload: (file: File) => Promise<WorkflowDocumentRef | null>;
}>();
const emit = defineEmits<{ start: [input: JsonValue, documents: WorkflowDocumentRef[]] }>();

const pos = ref<Array<{ poNumber: string; vendor: string; budgetOwner: string }>>([]);
const loadError = ref<string | null>(null);
const poNumber = ref('');
const doc = ref<{ file: File } | { text: string } | null>(null);
const exampleText = ref<string | null>(null);

const ready = computed(() => !props.blocked && !props.busy && !!poNumber.value && doc.value !== null);

watch(() => props.example, (e) => {
  const x = e as { poNumber?: string; invoiceText?: string } | null;
  if (!x) return;
  poNumber.value = x.poNumber ?? '';
  exampleText.value = x.invoiceText ?? null;
});

async function submit(): Promise<void> {
  const d = doc.value!;
  if ('text' in d) {
    emit('start', { poNumber: poNumber.value, invoiceText: d.text }, []);
    return;
  }
  const ref = await props.upload(d.file);
  if (ref) emit('start', { poNumber: poNumber.value }, [ref]);
}

onMounted(async () => {
  try {
    pos.value = await apiFetch('/workflows/invoice-review/purchase-orders');
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
});
</script>

<style src="../../kit/workflow-form.css" scoped></style>
<style scoped>
.problem { color: var(--ion-color-danger); }
</style>

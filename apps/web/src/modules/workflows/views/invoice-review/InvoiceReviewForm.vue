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
    <div class="field">
      <span>Invoice</span>
      <div class="choices">
        <label><input v-model="mode" type="radio" value="upload" /> Upload the invoice</label>
        <label><input v-model="mode" type="radio" value="text" /> Paste its text</label>
      </div>
    </div>
    <label v-if="mode === 'upload'" class="field">
      <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" :disabled="blocked || busy" @change="pick" />
      <span class="note">PDF, Word, text or a photo of the invoice.</span>
    </label>
    <label v-else class="field">
      <textarea v-model="text" rows="10" placeholder="Paste the invoice here" :disabled="blocked || busy" />
    </label>
    <ion-button type="submit" :disabled="!ready">{{ busy ? 'Starting...' : 'Review the invoice' }}</ion-button>
  </form>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { IonButton } from '@ionic/vue';
import type { JsonValue, WorkflowDocumentRef } from '@orchestrator-ai/transport-types';
import { apiFetch } from '@/modules/workflows/services/workflows-api.service';

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
const mode = ref<'upload' | 'text'>('upload');
const text = ref('');
const file = ref<File | null>(null);

const ready = computed(() => !props.blocked && !props.busy && !!poNumber.value && (mode.value === 'text' ? !!text.value.trim() : !!file.value));

watch(() => props.example, (e) => {
  const x = e as { poNumber?: string; invoiceText?: string } | null;
  if (!x) return;
  poNumber.value = x.poNumber ?? '';
  if (x.invoiceText) {
    mode.value = 'text';
    text.value = x.invoiceText;
  }
});

function pick(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

async function submit(): Promise<void> {
  if (mode.value === 'text') {
    emit('start', { poNumber: poNumber.value, invoiceText: text.value.trim() }, []);
    return;
  }
  const ref = await props.upload(file.value!);
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

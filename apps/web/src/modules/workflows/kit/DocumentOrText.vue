<template>
  <div class="doc-or-text">
    <div class="field">
      <span>{{ label }}</span>
      <div class="choices">
        <label><input v-model="mode" type="radio" value="upload" :disabled="disabled" /> Upload it</label>
        <label><input v-model="mode" type="radio" value="text" :disabled="disabled" /> Paste its text</label>
      </div>
    </div>
    <label v-if="mode === 'upload'" class="field">
      <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" :disabled="disabled" @change="pick" />
      <span class="note">PDF, Word, text or a photo.</span>
    </label>
    <label v-else class="field">
      <textarea v-model="text" rows="10" :placeholder="`Paste the ${label.toLowerCase()} here`" :disabled="disabled" />
    </label>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

/**
 * A document for a workflow start: an upload or pasted text. The value is
 * { file } or { text } (or null while empty); the form uploads the file
 * through the page's `upload` and passes the ref to `start`.
 */
const props = defineProps<{ label: string; disabled: boolean; exampleText?: string | null }>();
const emit = defineEmits<{ change: [value: { file: File } | { text: string } | null] }>();

const mode = ref<'upload' | 'text'>('upload');
const text = ref('');
const file = ref<File | null>(null);

const value = computed(() => (mode.value === 'text' ? (text.value.trim() ? { text: text.value.trim() } : null) : file.value ? { file: file.value } : null));
watch(value, (v) => emit('change', v));

watch(() => props.exampleText, (t) => {
  if (!t) return;
  mode.value = 'text';
  text.value = t;
});

function pick(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}
</script>

<style src="./workflow-form.css" scoped></style>
<style scoped>
.doc-or-text { display: flex; flex-direction: column; gap: 8px; }
</style>

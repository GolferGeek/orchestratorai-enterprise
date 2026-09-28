<template>
  <label class="field" :class="{ 'field--wide': field.kind === 'textarea' }">
    <span v-if="field.label">{{ field.label }}<span v-if="field.required && !field.readOnly" class="req"> *</span></span>
    <input v-if="field.readOnly" :value="display" disabled />
    <textarea v-else-if="field.kind === 'textarea'" :value="text" :maxlength="field.maxLength" rows="6" :disabled="disabled" @input="emit('update', ($event.target as HTMLTextAreaElement).value)" />
    <input
      v-else-if="field.kind === 'number'"
      type="number"
      :value="modelValue ?? ''"
      :min="field.min"
      :max="field.max"
      step="any"
      :disabled="disabled"
      @input="emit('update', numberOf(($event.target as HTMLInputElement).value))"
    />
    <span v-else-if="field.kind === 'boolean'" class="check">
      <input type="checkbox" :checked="modelValue === true" :disabled="disabled" @change="emit('update', ($event.target as HTMLInputElement).checked)" />
    </span>
    <select v-else-if="field.kind === 'select'" :value="text" :disabled="disabled" @change="emit('update', ($event.target as HTMLSelectElement).value || null)">
      <option v-if="!field.required" value="">-</option>
      <option v-for="o in field.options ?? []" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <input v-else :type="field.kind === 'url' ? 'url' : 'text'" :value="text" :maxlength="field.maxLength" :disabled="disabled" @input="emit('update', ($event.target as HTMLInputElement).value)" />
    <span v-if="field.help" class="note">{{ field.help }}</span>
  </label>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { JsonValue, WorkflowAdminField } from '@orchestrator-ai/transport-types';

const props = defineProps<{ field: WorkflowAdminField; modelValue: JsonValue | undefined; disabled?: boolean }>();
const emit = defineEmits<{ update: [value: JsonValue] }>();

const text = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''));
const display = computed(() => {
  if (props.modelValue === null || props.modelValue === undefined) return '';
  if (props.field.kind === 'boolean') return props.modelValue === true ? 'Yes' : 'No';
  return String(props.modelValue);
});
/** An empty box is "no value" (the API refuses it if the field is required). */
const numberOf = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));
</script>

<style src="../kit/workflow-form.css" scoped></style>
<style scoped>
.field--wide { grid-column: 1 / -1; }
.req { color: var(--ion-color-danger); }
.check { display: flex; align-items: center; min-height: 34px; }
.check input { width: 18px; height: 18px; }
</style>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  placeholder?: string;
  modelValue?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'search', value: string): void;
}>();

const localValue = ref(props.modelValue ?? '');

function handleInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  localValue.value = val;
  emit('update:modelValue', val);
  emit('search', val);
}
</script>

<template>
  <div style="position:relative;">
    <span
      style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--color-text-muted);font-size:13px;"
    >
      ⌕
    </span>
    <input
      class="form-input"
      :placeholder="placeholder ?? 'Search...'"
      :value="localValue"
      style="padding-left:32px;"
      @input="handleInput"
    />
  </div>
</template>

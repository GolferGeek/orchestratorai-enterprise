<template>
  <div v-if="message || (errors && errors.length > 0)" class="validation-message" :class="typeClass">
    <span>{{ message || (errors && errors[0]) }}</span>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

interface Props {
  message?: string;
  errors?: string[];
  type?: 'error' | 'warning' | 'success';
}

const props = withDefaults(defineProps<Props>(), {
  message: undefined,
  errors: () => [],
  type: 'error',
});

const typeClass = computed(() => `validation-message--${props.type}`);
</script>

<style scoped>
.validation-message {
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.validation-message--error {
  background: #fef2f2;
  color: var(--ion-color-danger);
  border: 1px solid #fecaca;
}

.validation-message--warning {
  background: #fffbeb;
  color: var(--ion-color-warning);
  border: 1px solid #fed7aa;
}

.validation-message--success {
  background: #f0fdf4;
  color: var(--ion-color-success);
  border: 1px solid #bbf7d0;
}
</style>

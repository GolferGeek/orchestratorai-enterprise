<template>
  <span
    class="oai-badge"
    :class="[`oai-badge--${variant}`, `oai-badge--${size}`]"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
  size?: 'sm' | 'md';
}>(), {
  variant: 'default',
  size: 'md',
});
</script>

<style scoped>
.oai-badge {
  display: inline-flex;
  align-items: center;
  font-family: var(--oai-font-family);
  font-weight: var(--oai-font-weight-medium);
  border-radius: var(--oai-radius-full);
  border: 1px solid transparent;
  white-space: nowrap;
  line-height: 1;
}

/* Sizes */
.oai-badge--sm {
  font-size: var(--oai-font-size-xs);
  padding: 2px 8px;
}

.oai-badge--md {
  font-size: var(--oai-font-size-xs);
  padding: 4px 10px;
}

/* Variants */
.oai-badge--default {
  background: var(--oai-badge-neutral-bg);
  color: var(--oai-badge-neutral-color);
  border-color: var(--oai-badge-neutral-border);
}

.oai-badge--primary {
  background: var(--oai-badge-primary-bg);
  color: var(--oai-badge-primary-color);
  border-color: var(--oai-badge-primary-border);
}

.oai-badge--success {
  background: var(--oai-badge-success-bg);
  color: var(--oai-badge-success-color);
  border-color: var(--oai-badge-success-border);
}

.oai-badge--warning {
  background: var(--oai-badge-warning-bg);
  color: var(--oai-badge-warning-color);
  border-color: var(--oai-badge-warning-border);
}

.oai-badge--danger {
  background: var(--oai-badge-danger-bg);
  color: var(--oai-badge-danger-color);
  border-color: var(--oai-badge-danger-border);
}

.oai-badge--info {
  background: var(--oai-badge-info-bg);
  color: var(--oai-badge-info-color);
  border-color: var(--oai-badge-info-border);
}

.oai-badge--violet {
  background: var(--oai-badge-accent-bg);
  color: var(--oai-badge-accent-color);
  border-color: var(--oai-badge-accent-border);
}
</style>

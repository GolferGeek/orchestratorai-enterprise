<template>
  <span
    class="oai-status-dot"
    :class="[
      `oai-status-dot--${status}`,
      `oai-status-dot--${size}`,
      pulse ? 'oai-status-dot--pulse' : '',
    ]"
    :aria-label="status"
  />
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  status: 'online' | 'offline' | 'warning' | 'error' | 'idle';
  pulse?: boolean;
  size?: 'sm' | 'md';
}>(), {
  pulse: false,
  size: 'md',
});
</script>

<style scoped>
.oai-status-dot {
  display: inline-block;
  border-radius: var(--oai-radius-full);
  flex-shrink: 0;
}

/* Sizes */
.oai-status-dot--sm {
  width: 6px;
  height: 6px;
}

.oai-status-dot--md {
  width: 10px;
  height: 10px;
}

/* Status colors */
.oai-status-dot--online {
  background: var(--oai-status-online);
}

.oai-status-dot--offline {
  background: var(--oai-status-offline);
}

.oai-status-dot--warning {
  background: var(--oai-status-busy);
}

.oai-status-dot--error {
  background: var(--oai-status-error);
}

.oai-status-dot--idle {
  background: var(--oai-status-away);
}

/* Pulse animation */
@keyframes oai-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.4);
  }
}

.oai-status-dot--pulse {
  animation: oai-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>

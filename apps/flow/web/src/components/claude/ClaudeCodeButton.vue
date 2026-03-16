<template>
  <button
    class="claude-code-button"
    :class="{ 'claude-code-button--active': active }"
    :title="active ? 'Close Claude pane' : 'Open Claude pane'"
    aria-label="Toggle Claude pane"
    @click="emit('click')"
  >
    <span class="claude-code-button__icon" aria-hidden="true">&#8984;</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  active?: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<style scoped>
.claude-code-button {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 200;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--color-primary, #6366f1);
  color: #ffffff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
}

.claude-code-button:hover {
  background: var(--color-primary-hover, #4f46e5);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
  transform: translateY(-1px);
}

.claude-code-button:active {
  transform: translateY(0);
}

.claude-code-button--active {
  background: var(--color-primary-hover, #4f46e5);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.claude-code-button__icon {
  line-height: 1;
}
</style>

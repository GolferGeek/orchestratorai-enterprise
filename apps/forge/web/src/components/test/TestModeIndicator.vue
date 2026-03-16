<script setup lang="ts">
/**
 * TestModeIndicator Component
 *
 * Displays a prominent TEST MODE banner/badge to indicate test data context.
 * Used across all Phase 3 Test Data Management UI screens.
 */

interface Props {
  /** Display variant */
  variant?: 'banner' | 'badge' | 'inline';
  /** Optional message to display alongside indicator */
  message?: string;
  /** Whether to show pulsing animation */
  pulse?: boolean;
}

withDefaults(defineProps<Props>(), {
  variant: 'banner',
  message: '',
  pulse: false,
});
</script>

<template>
  <div
    :class="[
      'test-mode-indicator',
      `test-mode-indicator--${variant}`,
      { 'test-mode-indicator--pulse': pulse },
    ]"
  >
    <div class="test-mode-indicator__content">
      <svg
        v-if="variant !== 'inline'"
        class="test-mode-indicator__icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14,2 14,8 20,8" />
        <path d="M12 18v-6" />
        <path d="M9.5 15.5 12 18l2.5-2.5" />
      </svg>
      <span class="test-mode-indicator__label">TEST MODE</span>
      <span v-if="message" class="test-mode-indicator__message">{{ message }}</span>
    </div>
  </div>
</template>

<style scoped>
.test-mode-indicator {
  --test-color: #f59e0b;
  --test-bg: #fef3c7;
  --test-border: #fcd34d;
  --test-text: #92400e;
}

/* Banner variant - full width header */
.test-mode-indicator--banner {
  width: 100%;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, var(--test-bg) 0%, #fde68a 100%);
  border-bottom: 2px solid var(--test-border);
  display: flex;
  justify-content: center;
  align-items: center;
}

.test-mode-indicator--banner .test-mode-indicator__content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.test-mode-indicator--banner .test-mode-indicator__icon {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--test-color);
}

.test-mode-indicator--banner .test-mode-indicator__label {
  font-weight: 700;
  font-size: 0.875rem;
  letter-spacing: 0.05em;
  color: var(--test-text);
}

.test-mode-indicator--banner .test-mode-indicator__message {
  font-size: 0.875rem;
  color: var(--test-text);
  opacity: 0.8;
}

/* Badge variant - compact pill */
.test-mode-indicator--badge {
  display: inline-flex;
  padding: 0.25rem 0.75rem;
  background: var(--test-bg);
  border: 1px solid var(--test-border);
  border-radius: 9999px;
}

.test-mode-indicator--badge .test-mode-indicator__content {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.test-mode-indicator--badge .test-mode-indicator__icon {
  width: 0.875rem;
  height: 0.875rem;
  color: var(--test-color);
}

.test-mode-indicator--badge .test-mode-indicator__label {
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.025em;
  color: var(--test-text);
}

.test-mode-indicator--badge .test-mode-indicator__message {
  font-size: 0.75rem;
  color: var(--test-text);
  opacity: 0.8;
}

/* Inline variant - minimal */
.test-mode-indicator--inline {
  display: inline-flex;
}

.test-mode-indicator--inline .test-mode-indicator__content {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.test-mode-indicator--inline .test-mode-indicator__label {
  font-weight: 600;
  font-size: 0.625rem;
  letter-spacing: 0.05em;
  color: var(--test-color);
  text-transform: uppercase;
}

.test-mode-indicator--inline .test-mode-indicator__message {
  display: none;
}

/* Pulse animation */
.test-mode-indicator--pulse {
  animation: test-pulse 2s ease-in-out infinite;
}

@keyframes test-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .test-mode-indicator {
    --test-color: #fbbf24;
    --test-bg: rgba(251, 191, 36, 0.15);
    --test-border: rgba(251, 191, 36, 0.3);
    --test-text: #fcd34d;
  }
}
</style>

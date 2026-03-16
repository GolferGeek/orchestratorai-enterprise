<script setup lang="ts">
import { computed } from 'vue';

/**
 * TestSymbolBadge Component
 *
 * Displays a T_ prefixed test symbol with visual distinction.
 * Shows both the test symbol and optionally the production symbol it mirrors.
 */

interface Props {
  /** The test symbol (must start with T_) */
  testSymbol: string;
  /** Optional production symbol being mirrored */
  productionSymbol?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show the full mapping */
  showMapping?: boolean;
  /** Whether symbol is clickable */
  clickable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  productionSymbol: '',
  size: 'md',
  showMapping: false,
  clickable: false,
});

const emit = defineEmits<{
  click: [symbol: string];
}>();

// Validate test symbol has T_ prefix
const isValidTestSymbol = computed(() => props.testSymbol.startsWith('T_'));
const baseSymbol = computed(() =>
  props.testSymbol.startsWith('T_') ? props.testSymbol.slice(2) : props.testSymbol
);

function handleClick() {
  if (props.clickable) {
    emit('click', props.testSymbol);
  }
}
</script>

<template>
  <span
    :class="[
      'test-symbol-badge',
      `test-symbol-badge--${size}`,
      { 'test-symbol-badge--clickable': clickable },
      { 'test-symbol-badge--invalid': !isValidTestSymbol },
    ]"
    @click="handleClick"
  >
    <span class="test-symbol-badge__prefix">T_</span>
    <span class="test-symbol-badge__symbol">{{ baseSymbol }}</span>

    <template v-if="showMapping && productionSymbol">
      <span class="test-symbol-badge__arrow">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </span>
      <span class="test-symbol-badge__production">{{ productionSymbol }}</span>
    </template>
  </span>
</template>

<style scoped>
.test-symbol-badge {
  display: inline-flex;
  align-items: center;
  gap: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #fcd34d;
  border-radius: 0.375rem;
  white-space: nowrap;
}

.test-symbol-badge--clickable {
  cursor: pointer;
  transition: all 0.15s ease;
}

.test-symbol-badge--clickable:hover {
  background: linear-gradient(135deg, #fde68a 0%, #fcd34d 100%);
  transform: translateY(-1px);
}

.test-symbol-badge--invalid {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border-color: #fca5a5;
}

.test-symbol-badge--invalid .test-symbol-badge__prefix {
  color: #dc2626;
}

/* Size variants */
.test-symbol-badge--sm {
  padding: 0.125rem 0.375rem;
  font-size: 0.75rem;
}

.test-symbol-badge--md {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.test-symbol-badge--lg {
  padding: 0.375rem 0.75rem;
  font-size: 1rem;
}

.test-symbol-badge__prefix {
  color: #d97706;
  font-weight: 700;
}

.test-symbol-badge__symbol {
  color: #92400e;
  font-weight: 600;
}

.test-symbol-badge__arrow {
  display: flex;
  align-items: center;
  margin: 0 0.25rem;
  opacity: 0.5;
}

.test-symbol-badge__arrow svg {
  width: 0.875em;
  height: 0.875em;
}

.test-symbol-badge__production {
  color: #6b7280;
  font-weight: 500;
  padding-left: 0.25rem;
  border-left: 1px solid rgba(0, 0, 0, 0.1);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .test-symbol-badge {
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%);
    border-color: rgba(251, 191, 36, 0.4);
  }

  .test-symbol-badge__prefix {
    color: #fbbf24;
  }

  .test-symbol-badge__symbol {
    color: #fcd34d;
  }

  .test-symbol-badge__production {
    color: #9ca3af;
    border-left-color: rgba(255, 255, 255, 0.1);
  }

  .test-symbol-badge--invalid {
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.2) 0%, rgba(185, 28, 28, 0.2) 100%);
    border-color: rgba(220, 38, 38, 0.4);
  }

  .test-symbol-badge--invalid .test-symbol-badge__prefix {
    color: #f87171;
  }
}
</style>

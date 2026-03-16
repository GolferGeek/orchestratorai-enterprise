<template>
  <div 
    v-if="shouldShow"
    class="sovereign-badge" 
    :class="badgeClasses"
    :title="tooltipText"
    @click="$emit('click')"
  >
    <span class="sovereign-icon">{{ icon }}</span>
    <span class="sovereign-text">{{ displayText }}</span>
    <span v-if="showStatus" class="sovereign-status">{{ statusText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePrivacyStore } from '@/stores/privacyStore';

interface Props {
  variant?: 'compact' | 'full' | 'minimal';
  showStatus?: boolean;
  showTooltip?: boolean;
  clickable?: boolean;
  forceShow?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'compact',
  showStatus: true,
  showTooltip: true,
  clickable: false,
  forceShow: false
});

defineEmits<{
  click: [];
}>();

const privacyStore = usePrivacyStore();

// Computed properties
const shouldShow = computed(() => {
  return props.forceShow || privacyStore.effectiveSovereignMode;
});

const icon = computed(() => {
  if (privacyStore.sovereignPolicy?.enforced) {
    return '🔒';
  }
  return privacyStore.effectiveSovereignMode ? '🛡️' : '🌐';
});

const displayText = computed(() => {
  if (props.variant === 'minimal') {
    return '';
  }
  if (props.variant === 'compact') {
    return 'Sovereign';
  }
  return 'Sovereign Mode';
});

const statusText = computed(() => {
  if (!props.showStatus) return '';
  return privacyStore.effectiveSovereignMode ? 'ON' : 'OFF';
});

const badgeClasses = computed(() => {
  const classes = [];

  // Variant classes
  classes.push(`sovereign-badge--${props.variant}`);

  // Status classes
  if (privacyStore.effectiveSovereignMode) {
    classes.push('sovereign-badge--active');
  } else {
    classes.push('sovereign-badge--inactive');
  }

  // Policy classes
  if (privacyStore.sovereignPolicy?.enforced) {
    classes.push('sovereign-badge--enforced');
  }

  // Interactive classes
  if (props.clickable) {
    classes.push('sovereign-badge--clickable');
  }

  return classes;
});

const tooltipText = computed(() => {
  if (!props.showTooltip) return '';

  if (privacyStore.sovereignPolicy?.enforced) {
    return 'Organization policy enforces sovereign mode - only local models are used';
  }

  if (privacyStore.effectiveSovereignMode) {
    return 'Sovereign mode active - using local models only for enhanced privacy';
  }

  return 'Sovereign mode inactive - external AI providers may be used';
});
</script>

<style scoped>
.sovereign-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

/* Variant styles */
.sovereign-badge--minimal {
  padding: 0.125rem 0.25rem;
  font-size: 0.7rem;
}

.sovereign-badge--compact {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.sovereign-badge--full {
  padding: 0.375rem 0.75rem;
  font-size: 0.8rem;
}

/* Status styles */
.sovereign-badge--active {
  background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
  color: #155724;
  border-color: #c3e6cb;
}

.sovereign-badge--inactive {
  background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
  color: #721c24;
  border-color: #f5c6cb;
}

.sovereign-badge--enforced {
  background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
  color: #856404;
  border-color: #ffeaa7;
  box-shadow: 0 2px 4px rgba(133, 100, 4, 0.1);
}

/* Interactive styles */
.sovereign-badge--clickable {
  cursor: pointer;
  user-select: none;
}

.sovereign-badge--clickable:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.sovereign-badge--clickable:active {
  transform: translateY(0);
}

/* Element styles */
.sovereign-icon {
  font-size: 1em;
  line-height: 1;
}

.sovereign-text {
  font-weight: 600;
  white-space: nowrap;
}

.sovereign-status {
  font-weight: 700;
  font-size: 0.9em;
  opacity: 0.9;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .sovereign-badge--full .sovereign-text {
    display: none;
  }
  
  .sovereign-badge--compact {
    padding: 0.2rem 0.4rem;
    font-size: 0.7rem;
  }
}
</style>

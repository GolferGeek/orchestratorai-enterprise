<template>
  <div 
    v-if="shouldShow"
    class="sovereign-banner" 
    :class="bannerClasses"
  >
    <div class="sovereign-banner__content">
      <div class="sovereign-banner__icon">{{ icon }}</div>
      <div class="sovereign-banner__text">
        <div class="sovereign-banner__title">{{ title }}</div>
        <div class="sovereign-banner__description">{{ description }}</div>
      </div>
      <div v-if="showStatus" class="sovereign-banner__status">
        <span class="sovereign-banner__status-badge" :class="statusBadgeClasses">
          {{ statusText }}
        </span>
      </div>
    </div>
    
    <!-- Dismissible banner -->
    <button
      v-if="dismissible"
      @click="$emit('dismiss')"
      class="sovereign-banner__dismiss"
      title="Dismiss banner"
    >
      ×
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePrivacyStore } from '@/stores/privacyStore';

interface Props {
  variant?: 'info' | 'warning' | 'enforced' | 'success';
  showStatus?: boolean;
  dismissible?: boolean;
  forceShow?: boolean;
  customTitle?: string;
  customDescription?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'info',
  showStatus: true,
  dismissible: false,
  forceShow: false,
  customTitle: '',
  customDescription: ''
});

defineEmits<{
  dismiss: [];
}>();

const privacyStore = usePrivacyStore();

// Computed properties
const shouldShow = computed(() => {
  if (props.forceShow) return true;

  // Show banner for important policy states
  return privacyStore.sovereignPolicy?.enforced ||
         privacyStore.effectiveSovereignMode;
});

const icon = computed(() => {
  switch (props.variant) {
    case 'enforced':
      return '🔒';
    case 'warning':
      return '⚠️';
    case 'success':
      return '✅';
    default:
      return privacyStore.effectiveSovereignMode ? '🛡️' : 'ℹ️';
  }
});

const title = computed(() => {
  if (props.customTitle) return props.customTitle;

  if (privacyStore.sovereignPolicy?.enforced) {
    return 'Sovereign Mode Enforced';
  }

  if (privacyStore.effectiveSovereignMode) {
    return 'Sovereign Mode Active';
  }

  return 'Sovereign Mode Available';
});

const description = computed(() => {
  if (props.customDescription) return props.customDescription;

  if (privacyStore.sovereignPolicy?.enforced) {
    return 'Your organization requires all AI processing to use local models only. External providers are not available.';
  }

  if (privacyStore.effectiveSovereignMode) {
    return 'All AI processing is using local models for enhanced privacy and data sovereignty.';
  }

  return 'You can enable sovereign mode to use only local models for enhanced privacy.';
});

const statusText = computed(() => {
  return privacyStore.effectiveSovereignMode ? 'ACTIVE' : 'INACTIVE';
});

const bannerClasses = computed(() => {
  const classes = [`sovereign-banner--${props.variant}`];

  if (privacyStore.effectiveSovereignMode) {
    classes.push('sovereign-banner--active');
  }

  if (props.dismissible) {
    classes.push('sovereign-banner--dismissible');
  }

  return classes;
});

const statusBadgeClasses = computed(() => {
  return privacyStore.effectiveSovereignMode
    ? 'sovereign-banner__status-badge--active'
    : 'sovereign-banner__status-badge--inactive';
});
</script>

<style scoped>
.sovereign-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  border: 1px solid;
  position: relative;
  transition: all 0.3s ease;
}

.sovereign-banner__content {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.sovereign-banner__icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.sovereign-banner__text {
  flex: 1;
}

.sovereign-banner__title {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.sovereign-banner__description {
  font-size: 0.9rem;
  line-height: 1.4;
  opacity: 0.9;
}

.sovereign-banner__status {
  flex-shrink: 0;
}

.sovereign-banner__status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sovereign-banner__status-badge--active {
  background: rgba(21, 87, 36, 0.1);
  color: #155724;
  border: 1px solid rgba(21, 87, 36, 0.2);
}

.sovereign-banner__status-badge--inactive {
  background: rgba(114, 28, 36, 0.1);
  color: #721c24;
  border: 1px solid rgba(114, 28, 36, 0.2);
}

.sovereign-banner__dismiss {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  transition: opacity 0.2s ease;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.sovereign-banner__dismiss:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.1);
}

/* Variant styles */
.sovereign-banner--info {
  background: linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%);
  color: #0c5460;
  border-color: #bee5eb;
}

.sovereign-banner--warning {
  background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
  color: #856404;
  border-color: #ffeaa7;
}

.sovereign-banner--enforced {
  background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
  color: #721c24;
  border-color: #f5c6cb;
  box-shadow: 0 4px 8px rgba(114, 28, 36, 0.1);
}

.sovereign-banner--success {
  background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
  color: #155724;
  border-color: #c3e6cb;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .sovereign-banner {
    padding: 0.75rem;
  }
  
  .sovereign-banner__content {
    gap: 0.75rem;
  }
  
  .sovereign-banner__icon {
    font-size: 1.25rem;
  }
  
  .sovereign-banner__title {
    font-size: 0.9rem;
  }
  
  .sovereign-banner__description {
    font-size: 0.8rem;
  }
  
  .sovereign-banner--dismissible {
    padding-right: 2.5rem;
  }
}
</style>

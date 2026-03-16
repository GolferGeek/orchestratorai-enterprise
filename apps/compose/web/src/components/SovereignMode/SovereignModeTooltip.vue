<template>
  <div class="sovereign-tooltip-wrapper" @mouseenter="showTooltip" @mouseleave="hideTooltip">
    <!-- Trigger element -->
    <slot />
    
    <!-- Tooltip content -->
    <div 
      v-if="isVisible"
      class="sovereign-tooltip"
      :class="tooltipClasses"
      :style="tooltipStyles"
    >
      <div class="sovereign-tooltip__content">
        <div class="sovereign-tooltip__header">
          <span class="sovereign-tooltip__icon">{{ icon }}</span>
          <span class="sovereign-tooltip__title">{{ title }}</span>
        </div>
        
        <div class="sovereign-tooltip__body">
          <p class="sovereign-tooltip__description">{{ description }}</p>
          
          <div v-if="showDataFlow" class="sovereign-tooltip__data-flow">
            <div class="sovereign-tooltip__section-title">Data Flow:</div>
            <ul class="sovereign-tooltip__flow-list">
              <li v-for="step in dataFlowSteps" :key="step" class="sovereign-tooltip__flow-item">
                {{ step }}
              </li>
            </ul>
          </div>
          
          <div v-if="showCompliance" class="sovereign-tooltip__compliance">
            <div class="sovereign-tooltip__section-title">Compliance:</div>
            <p class="sovereign-tooltip__compliance-text">{{ complianceText }}</p>
          </div>
        </div>
      </div>
      
      <!-- Tooltip arrow -->
      <div class="sovereign-tooltip__arrow" :class="arrowClasses"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { usePrivacyStore } from '@/stores/privacyStore';

interface Props {
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  showDataFlow?: boolean;
  showCompliance?: boolean;
  customTitle?: string;
  customDescription?: string;
  delay?: number;
}

const props = withDefaults(defineProps<Props>(), {
  position: 'auto',
  showDataFlow: true,
  customTitle: undefined,
  customDescription: undefined,
  showCompliance: true,
  delay: 500
});

const sovereignPolicyStore = usePrivacyStore();

// Reactive state
const isVisible = ref(false);
const tooltipPosition = ref(props.position);
let showTimeout: NodeJS.Timeout | null = null;
let hideTimeout: NodeJS.Timeout | null = null;

// Computed properties
const icon = computed(() => {
  if (sovereignPolicyStore.sovereignPolicy?.enforced) {
    return '🔒';
  }
  return sovereignPolicyStore.effectiveSovereignMode ? '🛡️' : '🌐';
});

const title = computed(() => {
  if (props.customTitle) return props.customTitle;

  if (sovereignPolicyStore.sovereignPolicy?.enforced) {
    return 'Sovereign Mode (Enforced)';
  }

  if (sovereignPolicyStore.effectiveSovereignMode) {
    return 'Sovereign Mode (Active)';
  }

  return 'Sovereign Mode (Available)';
});

const description = computed(() => {
  if (props.customDescription) return props.customDescription;

  if (sovereignPolicyStore.sovereignPolicy?.enforced) {
    return 'Your organization requires all AI processing to use local models only. This ensures maximum data privacy and compliance with organizational policies.';
  }

  if (sovereignPolicyStore.effectiveSovereignMode) {
    return 'All AI processing is currently using local models (Ollama) for enhanced privacy and data sovereignty. Your data never leaves your infrastructure.';
  }

  return 'Sovereign mode allows you to use only local AI models, ensuring your data never leaves your infrastructure. Toggle this mode for enhanced privacy and compliance.';
});

const dataFlowSteps = computed(() => {
  if (sovereignPolicyStore.effectiveSovereignMode) {
    return [
      'Your input is processed locally',
      'Local AI model (Ollama) generates response',
      'No data sent to external providers',
      'Complete data sovereignty maintained'
    ];
  } else {
    return [
      'Your input may be sent to external AI providers',
      'External models process your request',
      'Response is returned through secure channels',
      'Data handling follows provider policies'
    ];
  }
});

const complianceText = computed(() => {
  if (sovereignPolicyStore.sovereignPolicy?.enforced) {
    return 'Organization policy enforces sovereign mode for regulatory compliance and data protection requirements.';
  }

  if (sovereignPolicyStore.effectiveSovereignMode) {
    return 'Meets highest privacy standards including GDPR, HIPAA, and other data protection regulations.';
  }

  return 'Enable sovereign mode to meet strict compliance requirements and ensure data never leaves your infrastructure.';
});

const tooltipClasses = computed(() => {
  const classes = [`sovereign-tooltip--${tooltipPosition.value}`];

  if (sovereignPolicyStore.effectiveSovereignMode) {
    classes.push('sovereign-tooltip--active');
  } else {
    classes.push('sovereign-tooltip--inactive');
  }

  if (sovereignPolicyStore.sovereignPolicy?.enforced) {
    classes.push('sovereign-tooltip--enforced');
  }

  return classes;
});

const arrowClasses = computed(() => {
  return [`sovereign-tooltip__arrow--${tooltipPosition.value}`];
});

const tooltipStyles = computed(() => {
  // Dynamic positioning logic would go here
  // For now, using CSS positioning
  return {};
});

// Methods
const showTooltip = () => {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  showTimeout = setTimeout(() => {
    isVisible.value = true;
  }, props.delay);
};

const hideTooltip = () => {
  if (showTimeout) {
    clearTimeout(showTimeout);
    showTimeout = null;
  }
  
  hideTimeout = setTimeout(() => {
    isVisible.value = false;
  }, 100);
};

// Cleanup
onUnmounted(() => {
  if (showTimeout) clearTimeout(showTimeout);
  if (hideTimeout) clearTimeout(hideTimeout);
});
</script>

<style scoped>
.sovereign-tooltip-wrapper {
  position: relative;
  display: inline-block;
}

.sovereign-tooltip {
  position: absolute;
  z-index: 1000;
  max-width: 320px;
  padding: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border: 1px solid #e0e0e0;
  font-size: 0.9rem;
  line-height: 1.4;
  opacity: 0;
  transform: scale(0.95);
  animation: tooltipFadeIn 0.2s ease forwards;
}

@keyframes tooltipFadeIn {
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.sovereign-tooltip__content {
  padding: 1rem;
}

.sovereign-tooltip__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #f0f0f0;
}

.sovereign-tooltip__icon {
  font-size: 1.2rem;
}

.sovereign-tooltip__title {
  font-weight: 600;
  color: #333;
}

.sovereign-tooltip__description {
  margin: 0 0 1rem 0;
  color: #555;
}

.sovereign-tooltip__section-title {
  font-weight: 600;
  color: #333;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sovereign-tooltip__data-flow {
  margin-bottom: 1rem;
}

.sovereign-tooltip__flow-list {
  margin: 0;
  padding-left: 1rem;
  list-style: none;
}

.sovereign-tooltip__flow-item {
  position: relative;
  margin-bottom: 0.25rem;
  color: #666;
  font-size: 0.85rem;
}

.sovereign-tooltip__flow-item::before {
  content: '→';
  position: absolute;
  left: -1rem;
  color: #999;
}

.sovereign-tooltip__compliance-text {
  margin: 0;
  color: #666;
  font-size: 0.85rem;
}

.sovereign-tooltip__arrow {
  position: absolute;
  width: 0;
  height: 0;
  border: 6px solid transparent;
}

/* Positioning */
.sovereign-tooltip--top {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
}

.sovereign-tooltip--bottom {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
}

.sovereign-tooltip--left {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-right: 8px;
}

.sovereign-tooltip--right {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 8px;
}

/* Arrow positioning */
.sovereign-tooltip__arrow--top {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-top-color: white;
}

.sovereign-tooltip__arrow--bottom {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-bottom-color: white;
}

.sovereign-tooltip__arrow--left {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-left-color: white;
}

.sovereign-tooltip__arrow--right {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-right-color: white;
}

/* Theme variants */
.sovereign-tooltip--active {
  border-color: #c3e6cb;
}

.sovereign-tooltip--active .sovereign-tooltip__header {
  border-bottom-color: #c3e6cb;
}

.sovereign-tooltip--inactive {
  border-color: #f5c6cb;
}

.sovereign-tooltip--inactive .sovereign-tooltip__header {
  border-bottom-color: #f5c6cb;
}

.sovereign-tooltip--enforced {
  border-color: #ffeaa7;
  background: linear-gradient(135deg, #fffef7 0%, #fefcf0 100%);
}

.sovereign-tooltip--enforced .sovereign-tooltip__header {
  border-bottom-color: #ffeaa7;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .sovereign-tooltip {
    max-width: 280px;
    font-size: 0.85rem;
  }
  
  .sovereign-tooltip__content {
    padding: 0.75rem;
  }
}
</style>

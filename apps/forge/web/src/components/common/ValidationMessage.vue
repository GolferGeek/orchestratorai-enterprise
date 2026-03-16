<template>
  <div 
    v-if="shouldShow" 
    :class="messageClasses"
    class="validation-message"
  >
    <ion-icon 
      v-if="showIcon" 
      :icon="statusIcon" 
      :style="{ color: severityColor }"
      class="validation-message__icon"
    />
    
    <div class="validation-message__content">
      <!-- Primary message -->
      <div class="validation-message__text" :style="{ color: severityColor }">
        {{ displayMessage }}
      </div>
      
      <!-- Suggestion (for warnings) -->
      <div 
        v-if="(suggestion && type === 'warning') || (warnings && warnings.length > 0 && warnings[0].suggestion)" 
        class="validation-message__suggestion"
      >
        {{ suggestion || (warnings && warnings[0]?.suggestion) }}
      </div>
      
      <!-- Details (for development/debug) -->
      <details 
        v-if="showDetails && context" 
        class="validation-message__details"
      >
        <summary>Technical Details</summary>
        <pre class="validation-message__context">{{ JSON.stringify(context, null, 2) }}</pre>
      </details>
    </div>
    
    <!-- Actions -->
    <div v-if="showActions" class="validation-message__actions">
      <ion-button 
        v-if="type === 'error' && canRetry"
        size="small" 
        fill="clear" 
        @click="$emit('retry')"
      >
        <ion-icon :icon="refreshOutline" slot="start" />
        Retry
      </ion-button>
      
      <ion-button 
        v-if="dismissible"
        size="small" 
        fill="clear" 
        @click="$emit('dismiss')"
      >
        <ion-icon :icon="closeOutline" slot="start" />
        Dismiss
      </ion-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { IonIcon, IonButton } from '@ionic/vue';
import { 
  checkmarkCircleOutline, 
  alertCircleOutline, 
  warningOutline, 
  alertOutline,
  syncOutline,
  refreshOutline,
  closeOutline
} from 'ionicons/icons';
import { ValidationError, ValidationWarning } from '@/types/validation';
import { ValidationHelpers } from '@/utils/validationHelpers';

// =====================================
// PROPS & EMITS
// =====================================

interface Props {
  // Validation data
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
  isValidating?: boolean;
  
  // Display options
  type?: 'error' | 'warning' | 'success' | 'validating';
  message?: string;
  suggestion?: string;
  context?: Record<string, unknown>;
  
  // Behavior options
  showIcon?: boolean;
  showDetails?: boolean;
  showActions?: boolean;
  dismissible?: boolean;
  canRetry?: boolean;
  
  // Styling options
  inline?: boolean;
  compact?: boolean;
  severity?: 'error' | 'critical' | 'warning';
}

const props = withDefaults(defineProps<Props>(), {
  errors: () => [],
  warnings: () => [],
  isValidating: false,
  type: undefined,
  message: undefined,
  suggestion: undefined,
  context: undefined,
  showIcon: true,
  showDetails: false,
  showActions: false,
  dismissible: false,
  canRetry: false,
  inline: false,
  compact: false,
  severity: undefined,
});

interface Emits {
  retry: [];
  dismiss: [];
}

const _emit = defineEmits<Emits>();

// =====================================
// COMPUTED PROPERTIES
// =====================================

const shouldShow = computed(() => {
  if (props.isValidating) return true;
  if (props.message) return true;
  if (props.errors && props.errors.length > 0) return true;
  if (props.warnings && props.warnings.length > 0) return true;
  return false;
});

const messageType = computed(() => {
  if (props.type) return props.type;
  if (props.isValidating) return 'validating';
  if (props.errors && props.errors.length > 0) {
    const hasCritical = props.errors.some(error => error.severity === 'critical');
    return hasCritical ? 'error' : 'error';
  }
  if (props.warnings && props.warnings.length > 0) return 'warning';
  return 'success';
});

const displayMessage = computed(() => {
  if (props.message) return props.message;
  if (props.isValidating) return 'Validating...';
  
  if (props.errors && props.errors.length > 0) {
    const primaryError = props.errors[0];
    return ValidationHelpers.getValidationMessage(primaryError.code, primaryError.context);
  }
  
  if (props.warnings && props.warnings.length > 0) {
    const primaryWarning = props.warnings[0];
    return primaryWarning.message || ValidationHelpers.getValidationMessage(primaryWarning.code);
  }
  
  return 'Valid';
});

const severityColor = computed(() => {
  if (props.isValidating) return '#6b7280'; // gray-500
  
  const severity = props.severity || 
    (props.errors && props.errors.length > 0 ? 
      (props.errors.some(e => e.severity === 'critical') ? 'critical' : 'error') : 
      'warning');
      
  return ValidationHelpers.getValidationSeverityColor(severity);
});

const statusIcon = computed(() => {
  if (props.isValidating) return syncOutline;
  
  const status = messageType.value === 'error' ? 
    (props.errors?.some(e => e.severity === 'critical') ? 'critical' : 'error') : 
    messageType.value;
    
  const iconMap = {
    success: checkmarkCircleOutline,
    error: alertCircleOutline,
    warning: warningOutline,
    critical: alertOutline,
    validating: syncOutline,
  };
  
  return iconMap[status as keyof typeof iconMap] || alertCircleOutline;
});

const messageClasses = computed(() => {
  return [
    'validation-message',
    `validation-message--${messageType.value}`,
    {
      'validation-message--inline': props.inline,
      'validation-message--compact': props.compact,
      'validation-message--with-actions': props.showActions,
      'validation-message--critical': props.errors?.some(e => e.severity === 'critical'),
    }
  ];
});
</script>

<style scoped>
.validation-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.4;
  transition: all 0.2s ease;
}

.validation-message--inline {
  display: inline-flex;
  padding: 4px 8px;
  font-size: 12px;
}

.validation-message--compact {
  padding: 4px 8px;
  gap: 4px;
}

.validation-message--error {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
}

.validation-message--critical {
  background-color: #fef2f2;
  border: 1px solid #dc2626;
  animation: pulse 2s infinite;
}

.validation-message--warning {
  background-color: #fffbeb;
  border: 1px solid #fed7aa;
}

.validation-message--success {
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.validation-message--validating {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
}

.validation-message__icon {
  font-size: 16px;
  margin-top: 1px;
  flex-shrink: 0;
}

.validation-message--inline .validation-message__icon {
  font-size: 14px;
}

.validation-message--compact .validation-message__icon {
  font-size: 14px;
}

.validation-message__content {
  flex: 1;
  min-width: 0;
}

.validation-message__text {
  font-weight: 500;
  word-break: break-word;
}

.validation-message__suggestion {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
  font-style: italic;
}

.validation-message__details {
  margin-top: 8px;
}

.validation-message__details summary {
  cursor: pointer;
  font-size: 12px;
  color: #6b7280;
  user-select: none;
}

.validation-message__details summary:hover {
  color: #374151;
}

.validation-message__context {
  margin-top: 4px;
  padding: 8px;
  background-color: #f9fafb;
  border-radius: 4px;
  font-size: 11px;
  color: #374151;
  overflow-x: auto;
  white-space: pre-wrap;
}

.validation-message__actions {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  flex-shrink: 0;
}

.validation-message--inline .validation-message__actions {
  margin-left: 4px;
}

/* Animations */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .validation-message--error {
    background-color: #1f1f1f;
    border-color: #dc2626;
  }
  
  .validation-message--critical {
    background-color: #1f1f1f;
    border-color: #dc2626;
  }
  
  .validation-message--warning {
    background-color: #1f1f1f;
    border-color: #d97706;
  }
  
  .validation-message--success {
    background-color: #1f1f1f;
    border-color: #059669;
  }
  
  .validation-message--validating {
    background-color: #1f1f1f;
    border-color: #6b7280;
  }
  
  .validation-message__context {
    background-color: #2d2d2d;
    color: #e5e7eb;
  }
  
  .validation-message__suggestion {
    color: #9ca3af;
  }
  
  .validation-message__details summary {
    color: #9ca3af;
  }
  
  .validation-message__details summary:hover {
    color: #d1d5db;
  }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .validation-message {
    font-size: 13px;
    padding: 6px 10px;
  }
  
  .validation-message--inline {
    font-size: 11px;
    padding: 3px 6px;
  }
  
  .validation-message__actions {
    flex-direction: column;
    gap: 2px;
  }
}
</style>

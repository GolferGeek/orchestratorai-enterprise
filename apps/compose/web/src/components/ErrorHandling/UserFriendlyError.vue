<template>
  <div class="user-friendly-error" :class="[`severity-${error.severity}`, { compact }]">
    <ion-card class="error-card">
      <ion-card-content>
        <!-- Error Header -->
        <div class="error-header">
          <div class="error-icon">
            <ion-icon 
              :icon="getErrorIcon(error.type, error.severity)" 
              :color="getErrorColor(error.severity)"
              size="large"
            ></ion-icon>
          </div>
          <div class="error-content">
            <h3 class="error-title">{{ getErrorTitle(error.type, error.severity) }}</h3>
            <p class="error-message">{{ error.message }}</p>
          </div>
        </div>

        <!-- Error Details (Expandable) -->
        <div v-if="showDetails" class="error-details">
          <ion-button 
            fill="clear" 
            size="small" 
            @click="detailsExpanded = !detailsExpanded"
            class="details-toggle"
          >
            <ion-icon 
              :icon="detailsExpanded ? chevronUpOutline : chevronDownOutline" 
              slot="start"
            ></ion-icon>
            {{ detailsExpanded ? 'Hide Details' : 'Show Details' }}
          </ion-button>
          
          <div v-if="detailsExpanded" class="details-content">
            <div class="detail-item" v-if="error.details">
              <strong>Error Details:</strong>
              <pre class="error-text">{{ error.details }}</pre>
            </div>
            <div class="detail-item" v-if="error.url">
              <strong>Request URL:</strong>
              <code>{{ error.url }}</code>
            </div>
            <div class="detail-item" v-if="error.context?.status">
              <strong>HTTP Status:</strong>
              <code>{{ error.context.status }} {{ error.context.statusText }}</code>
            </div>
            <div class="detail-item" v-if="error.timestamp">
              <strong>Time:</strong>
              <span>{{ formatTimestamp(error.timestamp) }}</span>
            </div>
            <div class="detail-item" v-if="error.context?.retryCount">
              <strong>Retry Attempts:</strong>
              <span>{{ error.context.retryCount }}</span>
            </div>
          </div>
        </div>

        <!-- Recovery Actions -->
        <div class="recovery-actions" v-if="!compact">
          <h4 class="actions-title">What can you do?</h4>
          <div class="action-buttons">
            <ion-button 
              v-for="action in getRecoveryActions(error)" 
              :key="action.id"
              :fill="action.primary ? 'solid' : 'outline'"
              :color="action.color || 'primary'"
              size="small"
              @click="executeAction(action)"
              :disabled="action.disabled"
            >
              <ion-icon :icon="action.icon" slot="start" v-if="action.icon"></ion-icon>
              {{ action.label }}
            </ion-button>
          </div>
        </div>

        <!-- Compact Actions -->
        <div class="compact-actions" v-if="compact">
          <ion-button 
            v-for="action in getRecoveryActions(error).slice(0, 2)" 
            :key="action.id"
            fill="clear"
            size="small"
            @click="executeAction(action)"
            :disabled="action.disabled"
          >
            <ion-icon :icon="action.icon" v-if="action.icon"></ion-icon>
          </ion-button>
        </div>

        <!-- Dismiss Button -->
        <div class="error-dismiss" v-if="dismissible">
          <ion-button 
            fill="clear" 
            size="small" 
            @click="dismissError"
            color="medium"
          >
            <ion-icon :icon="closeOutline" slot="icon-only"></ion-icon>
          </ion-button>
        </div>
      </ion-card-content>
    </ion-card>
  </div>
</template>

<script setup lang="ts">
import { ref, getCurrentInstance } from 'vue';
import {
  IonCard, IonCardContent, IonButton, IonIcon
} from '@ionic/vue';
import {
  alertCircleOutline, warningOutline, informationCircleOutline,
  cloudOfflineOutline, lockClosedOutline, refreshOutline,
  chevronUpOutline, chevronDownOutline, closeOutline,
  homeOutline, settingsOutline, helpCircleOutline,
  bugOutline, wifiOutline
} from 'ionicons/icons';
import type { AppError } from '@/stores/errorStore';

// Props
const props = defineProps<{
  error: AppError;
  compact?: boolean;
  showDetails?: boolean;
  dismissible?: boolean;
}>();

// Emits
const emit = defineEmits<{
  dismiss: [errorId: string];
  retry: [error: AppError];
  navigate: [path: string];
  report: [error: AppError];
}>();

// Local state
const detailsExpanded = ref(false);
const instance = getCurrentInstance();

// Recovery action interface
interface RecoveryAction {
  id: string;
  label: string;
  icon?: string;
  primary?: boolean;
  color?: string;
  disabled?: boolean;
  action: 'retry' | 'navigate' | 'report' | 'refresh' | 'settings' | 'help';
  params?: Record<string, unknown>;
}

// Computed
const getErrorIcon = (type: string, severity: string): string => {
  if (severity === 'critical') return alertCircleOutline;
  
  switch (type) {
    case 'network':
      return cloudOfflineOutline;
    case 'permission':
      return lockClosedOutline;
    case 'api':
      return bugOutline;
    case 'validation':
      return warningOutline;
    default:
      return informationCircleOutline;
  }
};

const getErrorColor = (severity: string): string => {
  switch (severity) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'primary';
    case 'low':
      return 'medium';
    default:
      return 'medium';
  }
};

const getErrorTitle = (type: string, severity: string): string => {
  if (severity === 'critical') {
    return 'Critical System Issue';
  }
  
  switch (type) {
    case 'network':
      return 'Connection Problem';
    case 'permission':
      return 'Access Denied';
    case 'api':
      return 'Service Unavailable';
    case 'validation':
      return 'Invalid Request';
    default:
      return 'Something Went Wrong';
  }
};

const getRecoveryActions = (error: AppError): RecoveryAction[] => {
  const actions: RecoveryAction[] = [];
  
  // Common actions based on error type
  switch (error.type) {
    case 'network':
      actions.push({
        id: 'check-connection',
        label: 'Check Connection',
        icon: wifiOutline,
        primary: true,
        action: 'help',
        params: { topic: 'network-troubleshooting' }
      });
      actions.push({
        id: 'retry',
        label: 'Try Again',
        icon: refreshOutline,
        action: 'retry'
      });
      break;
      
    case 'permission':
      if (error.context?.status === 401) {
        actions.push({
          id: 'login',
          label: 'Sign In Again',
          icon: lockClosedOutline,
          primary: true,
          action: 'navigate',
          params: { path: '/login' }
        });
      }
      actions.push({
        id: 'home',
        label: 'Go Home',
        icon: homeOutline,
        action: 'navigate',
        params: { path: '/app/home' }
      });
      break;
      
    case 'api':
      actions.push({
        id: 'retry',
        label: 'Try Again',
        icon: refreshOutline,
        primary: true,
        action: 'retry'
      });
      if (error.severity === 'critical') {
        actions.push({
          id: 'report',
          label: 'Report Issue',
          icon: bugOutline,
          color: 'warning',
          action: 'report'
        });
      }
      break;
      
    case 'validation':
      actions.push({
        id: 'refresh',
        label: 'Refresh Page',
        icon: refreshOutline,
        primary: true,
        action: 'refresh'
      });
      break;
      
    default:
      actions.push({
        id: 'retry',
        label: 'Try Again',
        icon: refreshOutline,
        primary: true,
        action: 'retry'
      });
      actions.push({
        id: 'help',
        label: 'Get Help',
        icon: helpCircleOutline,
        action: 'help'
      });
  }
  
  // Add settings action for non-critical errors
  if (error.severity !== 'critical') {
    actions.push({
      id: 'settings',
      label: 'Settings',
      icon: settingsOutline,
      action: 'settings'
    });
  }
  
  return actions;
};

// Methods
const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

const executeAction = (action: RecoveryAction) => {
  // Check if component is still mounted before executing actions
  if (instance?.isUnmounted) return;

  switch (action.action) {
    case 'retry':
      emit('retry', props.error);
      break;
    case 'navigate':
      emit('navigate', (action.params?.path as string) || '/');
      break;
    case 'report':
      emit('report', props.error);
      break;
    case 'refresh':
      window.location.reload();
      break;
    case 'settings':
      emit('navigate', '/app/admin/settings');
      break;
    case 'help':
      if (action.params?.topic) {
        // Open help for specific topic
        window.open(`/help/${action.params.topic}`, '_blank');
      } else {
        emit('navigate', '/help');
      }
      break;
  }
};

const dismissError = () => {
  // Check if component is still mounted before dismissing
  if (instance?.isUnmounted) return;
  
  emit('dismiss', props.error.id);
};
</script>

<style scoped>
.user-friendly-error {
  margin: 1rem 0;
}

.error-card {
  position: relative;
  border-left: 4px solid var(--ion-color-medium);
  transition: all 0.3s ease;
}

.severity-low .error-card {
  border-left-color: var(--ion-color-medium);
  background: var(--ion-color-light);
}

.severity-medium .error-card {
  border-left-color: var(--ion-color-primary);
  background: var(--ion-color-primary-tint);
}

.severity-high .error-card {
  border-left-color: var(--ion-color-warning);
  background: var(--ion-color-warning-tint);
}

.severity-critical .error-card {
  border-left-color: var(--ion-color-danger);
  background: var(--ion-color-danger-tint);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}

.error-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.error-icon {
  flex-shrink: 0;
}

.error-content {
  flex: 1;
}

.error-title {
  margin: 0 0 0.5rem 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--ion-color-dark);
}

.error-message {
  margin: 0;
  color: var(--ion-color-dark-shade);
  line-height: 1.4;
}

.error-details {
  margin: 1rem 0;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-color-light-shade);
}

.details-toggle {
  --padding-start: 0;
  margin-bottom: 0.5rem;
}

.details-content {
  background: var(--ion-color-light);
  border-radius: 0.5rem;
  padding: 1rem;
}

.detail-item {
  margin-bottom: 0.75rem;
}

.detail-item:last-child {
  margin-bottom: 0;
}

.detail-item strong {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  color: var(--ion-color-medium);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.error-text {
  background: var(--ion-color-dark);
  color: var(--ion-color-light);
  padding: 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  margin: 0;
  overflow-x: auto;
  white-space: pre-wrap;
}

code {
  background: var(--ion-color-medium-tint);
  padding: 0.125rem 0.25rem;
  border-radius: 0.125rem;
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
}

.recovery-actions {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ion-color-light-shade);
}

.actions-title {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-color-dark);
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.compact-actions {
  display: flex;
  gap: 0.25rem;
  justify-content: flex-end;
  margin-top: 0.5rem;
}

.error-dismiss {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.compact .error-header {
  margin-bottom: 0.5rem;
}

.compact .error-title {
  font-size: 1rem;
}

.compact .error-message {
  font-size: 0.875rem;
}

/* Mobile Responsiveness */
@media (max-width: 48rem) {
  .error-header {
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .action-buttons ion-button {
    width: 100%;
  }
}
</style>

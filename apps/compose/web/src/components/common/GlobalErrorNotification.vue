<template>
  <ion-toast
    :is-open="isVisible"
    :message="errorMessage"
    :duration="duration"
    :color="toastColor"
    :position="position"
    :buttons="toastButtons"
    @didDismiss="onDismiss"
  />
  
  <!-- Critical error modal -->
  <ion-modal 
    :is-open="showCriticalModal" 
    @didDismiss="closeCriticalModal"
    :can-dismiss="false"
  >
    <ion-header>
      <ion-toolbar color="danger">
        <ion-title>Critical Error</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="closeCriticalModal" fill="clear">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    
    <ion-content class="critical-error-modal">
      <div class="critical-error-content">
        <div class="critical-error-icon">
          <ion-icon :icon="alertCircleOutline" />
        </div>
        
        <h2>Something went wrong</h2>
        <p>{{ criticalErrorMessage }}</p>
        
        <div class="critical-error-actions">
          <ion-button 
            @click="reloadPage" 
            color="secondary" 
            expand="block"
          >
            <ion-icon :icon="reloadOutline" slot="start" />
            Reload Application
          </ion-button>
          
          <ion-button 
            @click="reportCriticalError" 
            color="medium" 
            fill="outline" 
            expand="block"
          >
            <ion-icon :icon="bugOutline" slot="start" />
            Report Issue
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import {
  IonToast,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon
} from '@ionic/vue';
import {
  alertCircleOutline,
  closeOutline,
  reloadOutline,
  bugOutline,
  checkmarkOutline
} from 'ionicons/icons';
import { useErrorStore, type AppError } from '@/stores/errorStore';

const errorStore = useErrorStore();

// Component state
const isVisible = ref(false);
const showCriticalModal = ref(false);
const currentNotificationError = ref<AppError | null>(null);

// Computed properties
const errorMessage = computed(() => {
  if (!currentNotificationError.value) return '';
  
  const error = currentNotificationError.value;
  
  // Customize message based on error type and severity
  switch (error.type) {
    case 'network':
      return 'Connection issue detected. Please check your internet connection.';
    case 'api':
      return 'Service temporarily unavailable. Please try again.';
    case 'chunk-load':
      return 'Failed to load application resources. Please refresh the page.';
    case 'validation':
      return 'Invalid data detected. Please check your input.';
    case 'permission':
      return 'Access denied. Please check your permissions.';
    default:
      return error.message || 'An unexpected error occurred.';
  }
});

const criticalErrorMessage = computed(() => {
  const error = errorStore.currentGlobalError;
  if (!error) return 'A critical error has occurred.';
  
  switch (error.type) {
    case 'chunk-load':
      return 'The application failed to load properly. This usually happens after an update. Reloading should fix the issue.';
    case 'api':
      if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
        return 'Our servers are experiencing issues. Please try reloading or contact support if the problem persists.';
      }
      return 'A critical service error occurred. Please reload the application.';
    default:
      return 'A critical error has occurred that prevents the application from working properly. Please reload the page.';
  }
});

const toastColor = computed(() => {
  if (!currentNotificationError.value) return 'medium';
  
  switch (currentNotificationError.value.severity) {
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
});

const position = computed(() => 'top' as const);

const duration = computed(() => {
  if (!currentNotificationError.value) return 3000;
  
  switch (currentNotificationError.value.severity) {
    case 'critical':
      return 0; // Don't auto-dismiss critical errors
    case 'high':
      return 8000;
    case 'medium':
      return 5000;
    case 'low':
      return 3000;
    default:
      return 3000;
  }
});

const toastButtons = computed(() => {
  if (!currentNotificationError.value) return [];
  
  const buttons = [];
  
  // Always add dismiss button
  buttons.push({
    text: 'Dismiss',
    role: 'cancel',
    handler: () => {
      onDismiss();
    }
  });
  
  // Add action buttons based on error type
  if (currentNotificationError.value.severity === 'high' || currentNotificationError.value.severity === 'critical') {
    buttons.unshift({
      text: 'Retry',
      icon: checkmarkOutline,
      handler: () => {
        retryError();
      }
    });
  }
  
  return buttons;
});

// Watch for new errors
watch(
  () => errorStore.errors,
  (newErrors, oldErrors) => {
    if (newErrors.length > (oldErrors?.length || 0)) {
      const latestError = newErrors[0];
      
      // Show critical errors in modal
      if (latestError.severity === 'critical') {
        showCriticalError(latestError);
      } else {
        // Show other errors as toast notifications
        showErrorNotification(latestError);
      }
    }
  },
  { deep: true }
);

// Watch for global error visibility
watch(
  () => errorStore.globalErrorVisible,
  (visible) => {
    showCriticalModal.value = visible;
  }
);

// Methods
const showErrorNotification = (error: AppError) => {
  // Don't show notifications for resolved errors
  if (error.resolved) return;

  // Don't show multiple notifications at once
  if (isVisible.value) return;

  currentNotificationError.value = error;
  isVisible.value = true;

};

const showCriticalError = (error: AppError) => {
  errorStore.showGlobalError(error);
};

const onDismiss = () => {
  isVisible.value = false;
  currentNotificationError.value = null;
  
};

const closeCriticalModal = () => {
  errorStore.hideGlobalError();
  showCriticalModal.value = false;
  
};

const retryError = () => {
  if (!currentNotificationError.value) return;
  
  
  // Mark error as resolved (optimistic)
  errorStore.resolveError(currentNotificationError.value.id);
  
  // Increment retry count
  errorStore.incrementRetryCount(currentNotificationError.value.id);
  
  // Dismiss notification
  onDismiss();
  
  // You could emit an event here for components to listen to
  // emit('retry', currentNotificationError.value);
};

const reloadPage = () => {
  window.location.reload();
};

const reportCriticalError = async () => {
  const error = errorStore.currentGlobalError;
  if (!error) return;
  
  
  try {
    const success = await errorStore.reportError(error, 'Critical error reported by user');
    
    if (success) {
      // Show success feedback
      
      // You could show a success toast here
    } else {
      console.error('❌ Failed to report critical error');
      // You could show an error toast here
    }
  } catch (reportError) {
    console.error('❌ Error reporting failed:', reportError);
  }
};

// Expose methods for parent components
defineExpose({
  showErrorNotification,
  showCriticalError,
  closeCriticalModal,
  isVisible: computed(() => isVisible.value),
  showCriticalModal: computed(() => showCriticalModal.value)
});
</script>

<style scoped>
.critical-error-modal {
  --background: var(--ion-background-color);
}

.critical-error-content {
  padding: 32px 24px;
  text-align: center;
  max-width: 400px;
  margin: 0 auto;
}

.critical-error-icon {
  margin-bottom: 24px;
}

.critical-error-icon ion-icon {
  font-size: 64px;
  color: var(--ion-color-danger);
}

.critical-error-content h2 {
  margin: 0 0 16px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--ion-color-primary);
}

.critical-error-content p {
  margin: 0 0 32px 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--ion-color-medium-shade);
}

.critical-error-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Toast customization */
:deep(.toast-wrapper) {
  --border-radius: 8px;
  --box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .critical-error-content h2 {
    color: var(--ion-color-primary-tint);
  }
  
  .critical-error-content p {
    color: var(--ion-color-medium-tint);
  }
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .critical-error-content {
    padding: 24px 16px;
  }
  
  .critical-error-icon ion-icon {
    font-size: 48px;
  }
  
  .critical-error-content h2 {
    font-size: 20px;
  }
}
</style>

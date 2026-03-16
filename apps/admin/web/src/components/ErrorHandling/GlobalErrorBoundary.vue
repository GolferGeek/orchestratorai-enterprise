<template>
  <div class="global-error-boundary">
    <!-- Global Error Toast/Banner -->
    <ion-toast
      v-if="currentGlobalError"
      :is-open="showGlobalError"
      :message="currentGlobalError.message"
      :duration="getToastDuration(currentGlobalError.severity)"
      :color="getToastColor(currentGlobalError.severity)"
      :position="'top'"
      :buttons="getToastButtons(currentGlobalError)"
      @didDismiss="handleToastDismiss"
    ></ion-toast>

    <!-- Error List Modal -->
    <ion-modal 
      :is-open="showErrorModal" 
      @didDismiss="showErrorModal = false"
    >
      <ion-header>
        <ion-toolbar>
          <ion-title>System Issues</ion-title>
          <ion-buttons slot="end">
            <ion-button fill="clear" @click="showErrorModal = false">
              <ion-icon :icon="closeOutline"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <div class="error-list-content">
          <div v-if="criticalErrors.length > 0" class="error-section">
            <h3 class="section-title critical">
              <ion-icon :icon="alertCircleOutline" color="danger"></ion-icon>
              Critical Issues ({{ criticalErrors.length }})
            </h3>
            <UserFriendlyError
              v-for="error in criticalErrors"
              :key="error.id"
              :error="error"
              :dismissible="false"
              :show-details="true"
              @retry="handleRetry"
              @navigate="handleNavigate"
              @report="handleReport"
            />
          </div>

          <div v-if="highPriorityErrors.length > 0" class="error-section">
            <h3 class="section-title high">
              <ion-icon :icon="warningOutline" color="warning"></ion-icon>
              High Priority ({{ highPriorityErrors.length }})
            </h3>
            <UserFriendlyError
              v-for="error in highPriorityErrors"
              :key="error.id"
              :error="error"
              :dismissible="true"
              :show-details="true"
              @dismiss="handleDismiss"
              @retry="handleRetry"
              @navigate="handleNavigate"
              @report="handleReport"
            />
          </div>

          <div v-if="otherErrors.length > 0" class="error-section">
            <h3 class="section-title other">
              <ion-icon :icon="informationCircleOutline" color="medium"></ion-icon>
              Other Issues ({{ otherErrors.length }})
            </h3>
            <UserFriendlyError
              v-for="error in otherErrors"
              :key="error.id"
              :error="error"
              :compact="true"
              :dismissible="true"
              @dismiss="handleDismiss"
              @retry="handleRetry"
              @navigate="handleNavigate"
              @report="handleReport"
            />
          </div>

          <div v-if="unresolvedErrors.length === 0" class="no-errors">
            <ion-icon :icon="checkmarkCircleOutline" color="success" size="large"></ion-icon>
            <h3>All Clear!</h3>
            <p>No active system issues at this time.</p>
          </div>
        </div>
      </ion-content>
    </ion-modal>

    <!-- Floating Error Indicator -->
    <div 
      v-if="unresolvedErrors.length > 0 && !showErrorModal" 
      class="floating-error-indicator"
      @click="showErrorModal = true"
    >
      <ion-fab-button 
        size="small" 
        :color="getIndicatorColor()"
        class="error-fab"
      >
        <ion-icon :icon="alertCircleOutline"></ion-icon>
      </ion-fab-button>
    </div>

    <!-- Offline Indicator (compact, non-blocking) -->
    <div v-if="isOffline" class="offline-indicator" @click="checkConnection" title="Click to check connection">
      <ion-icon :icon="cloudOfflineOutline"></ion-icon>
      <span>Offline</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, getCurrentInstance } from 'vue';
import {
  IonToast, IonModal, IonHeader, IonToolbar, IonTitle, 
  IonButtons, IonButton, IonContent, IonIcon, IonFabButton
} from '@ionic/vue';
import {
  alertCircleOutline, warningOutline, informationCircleOutline,
  closeOutline, checkmarkCircleOutline, cloudOfflineOutline
} from 'ionicons/icons';
import { useRouter } from 'vue-router';
import { useErrorStore, type AppError } from '@/stores/errorStore';
import UserFriendlyError from './UserFriendlyError.vue';

// Composables
const router = useRouter();
const errorStore = useErrorStore();
const instance = getCurrentInstance();

// Local state
const showErrorModal = ref(false);
const showGlobalError = ref(false);
const isOffline = ref(!navigator.onLine);

// Computed
const unresolvedErrors = computed(() => errorStore.unresolvedErrors);
const criticalErrors = computed(() => 
  unresolvedErrors.value.filter(e => e.severity === 'critical')
);
const highPriorityErrors = computed(() => 
  unresolvedErrors.value.filter(e => e.severity === 'high')
);
const otherErrors = computed(() => 
  unresolvedErrors.value.filter(e => e.severity === 'medium' || e.severity === 'low')
);

const currentGlobalError = computed(() => {
  // Show the most severe unresolved error as global
  return criticalErrors.value[0] || highPriorityErrors.value[0] || null;
});

// Methods
const getToastDuration = (severity: string): number => {
  switch (severity) {
    case 'critical':
      return 0; // Don't auto-dismiss critical errors
    case 'high':
      return 8000;
    case 'medium':
      return 5000;
    case 'low':
      return 3000;
    default:
      return 5000;
  }
};

const getToastColor = (severity: string): string => {
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

const getToastButtons = (error: AppError) => {
  const buttons = [];
  
  if (error.severity === 'critical') {
    buttons.push({
      text: 'Details',
      role: 'info',
      handler: () => {
        showErrorModal.value = true;
      }
    });
  }
  
  buttons.push({
    text: 'Dismiss',
    role: 'cancel'
  });
  
  return buttons;
};

const getIndicatorColor = (): string => {
  if (criticalErrors.value.length > 0) return 'danger';
  if (highPriorityErrors.value.length > 0) return 'warning';
  return 'primary';
};

const handleToastDismiss = () => {
  showGlobalError.value = false;
  
  // Auto-dismiss non-critical errors
  if (currentGlobalError.value && currentGlobalError.value.severity !== 'critical') {
    errorStore.resolveError(currentGlobalError.value.id);
  }
};

const handleDismiss = (errorId: string) => {
  errorStore.resolveError(errorId);
};

const handleRetry = (error: AppError) => {
  // Emit retry event or implement retry logic
  
  // For API errors, we could trigger a retry of the failed request
  if (error.type === 'api' || error.type === 'network') {
    // Mark error as resolved for now
    errorStore.resolveError(error.id);
    
    // In a real implementation, you might:
    // - Re-execute the failed API call
    // - Refresh the current page data
    // - Trigger a specific retry mechanism
    window.location.reload();
  }
};

const handleNavigate = (path: string) => {
  router.push(path);
};

const handleReport = (error: AppError) => {
  // Implement error reporting

  // In a real implementation, you might:
  // - Send error to logging service
  // - Open a feedback form
  // - Create a support ticket

  // For now, mark as reported
  errorStore.reportError(
    error,
    'User reported this error via UI',
    'Error occurred during normal application use',
    'Application should work without errors'
  );
};

const checkConnection = () => {
  // Force a connection check
  isOffline.value = !navigator.onLine;
  
  if (!isOffline.value) {
    // Connection restored - you might want to retry failed requests
  }
};

// Network status handling
const handleOnline = () => {
  isOffline.value = false;
};

const handleOffline = () => {
  isOffline.value = true;
};

// Watch for new critical errors with lifecycle guard
watch(currentGlobalError, (newError, oldError) => {
  // Check if component is still mounted before updating
  if (instance?.isUnmounted) return;

  // Skip Vue internal errors to prevent cascade
  if (newError?.message?.includes('emitsOptions') ||
      newError?.message?.includes('Cannot read properties of null')) {
    return;
  }

  if (newError && newError.id !== oldError?.id) {
    showGlobalError.value = true;
  }
});

// Lifecycle
onMounted(() => {
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Show global error if there's already one
  if (currentGlobalError.value) {
    showGlobalError.value = true;
  }
});

onUnmounted(() => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});
</script>

<style scoped>
.global-error-boundary {
  position: relative;
}

.error-list-content {
  padding: 1rem;
}

.error-section {
  margin-bottom: 2rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.section-title.critical {
  color: var(--ion-color-danger);
}

.section-title.high {
  color: var(--ion-color-warning);
}

.section-title.other {
  color: var(--ion-color-medium);
}

.no-errors {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--ion-color-medium);
}

.no-errors h3 {
  margin: 1rem 0 0.5rem 0;
  color: var(--ion-color-success);
}

.floating-error-indicator {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  z-index: 1000;
  cursor: pointer;
}

.error-fab {
  position: relative;
  --box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}



/* Compact offline indicator - positioned in bottom-left corner */
.offline-indicator {
  position: fixed;
  bottom: 2rem;
  left: 2rem;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: var(--ion-color-warning);
  color: var(--ion-color-warning-contrast);
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.offline-indicator:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.offline-indicator ion-icon {
  font-size: 0.875rem;
}

/* Animation for floating indicator */
.error-fab {
  animation: pulse-glow 2s infinite;
}

@keyframes pulse-glow {
  0% { 
    transform: scale(1);
    box-shadow: 0 0 0 0 var(--ion-color-danger-tint);
  }
  70% { 
    transform: scale(1.05);
    box-shadow: 0 0 0 10px transparent;
  }
  100% { 
    transform: scale(1);
    box-shadow: 0 0 0 0 transparent;
  }
}

/* Mobile adjustments */
@media (max-width: 48rem) {
  .floating-error-indicator {
    bottom: 1rem;
    right: 1rem;
  }

  .offline-indicator {
    bottom: 1rem;
    left: 1rem;
  }
}
</style>

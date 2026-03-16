<template>
  <div class="error-boundary">
    <!-- Default slot when no error -->
    <slot v-if="!hasError" />
    
    <!-- Error fallback UI -->
    <div v-else class="error-boundary__fallback">
      <!-- Custom error slot if provided -->
      <slot 
        name="error" 
        :error="currentError"
        :error-info="errorInfo"
        :retry="retry"
        :clear="clearError"
      >
        <!-- Default error UI -->
        <div class="error-boundary__default">
          <ion-card class="error-boundary__card">
            <ion-card-header>
              <ion-card-title class="error-boundary__title">
                <ion-icon :icon="alertCircleOutline" class="error-boundary__icon" />
                {{ errorTitle }}
              </ion-card-title>
              <ion-card-subtitle class="error-boundary__subtitle">
                {{ errorMessage }}
              </ion-card-subtitle>
            </ion-card-header>
            
            <ion-card-content>
              <!-- Error details (development only) -->
              <div v-if="showDetails" class="error-boundary__details">
                <ion-accordion-group>
                  <ion-accordion value="details">
                    <ion-item slot="header">
                      <ion-label>Error Details</ion-label>
                    </ion-item>
                    <div slot="content" class="error-boundary__stack">
                      <pre>{{ errorDetails }}</pre>
                    </div>
                  </ion-accordion>
                </ion-accordion-group>
              </div>

              <!-- Recovery actions -->
              <div class="error-boundary__actions">
                <ion-button 
                  @click="retry" 
                  color="secondary" 
                  fill="solid"
                  :disabled="isRetrying"
                >
                  <ion-icon :icon="refreshOutline" slot="start" />
                  {{ isRetrying ? 'Retrying...' : 'Try Again' }}
                </ion-button>
                
                <ion-button 
                  @click="reload" 
                  color="medium" 
                  fill="outline"
                >
                  <ion-icon :icon="reloadOutline" slot="start" />
                  Reload Page
                </ion-button>
                
                <ion-button 
                  v-if="showNavigateHome"
                  @click="navigateHome" 
                  color="secondary" 
                  fill="clear"
                >
                  <ion-icon :icon="homeOutline" slot="start" />
                  Go Home
                </ion-button>
              </div>

              <!-- Report error -->
              <div class="error-boundary__report">
                <ion-button 
                  @click="reportError"
                  size="small"
                  fill="clear"
                  color="dark"
                >
                  <ion-icon :icon="bugOutline" slot="start" />
                  Report Issue
                </ion-button>
              </div>
            </ion-card-content>
          </ion-card>
        </div>
      </slot>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onErrorCaptured, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonButton,
  IonIcon,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel
} from '@ionic/vue';
import {
  alertCircleOutline,
  refreshOutline,
  reloadOutline,
  homeOutline,
  bugOutline
} from 'ionicons/icons';

// Error boundary configuration
interface ErrorBoundaryProps {
  fallbackComponent?: string;
  showDetails?: boolean;
  showNavigateHome?: boolean;
  maxRetries?: number;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
  onClear?: () => void;
}

interface ErrorInfo {
  componentName?: string;
  propsData?: Record<string, unknown>;
  lifecycle?: string;
  timestamp: number;
  userAgent: string;
  url: string;
}

// Props with defaults
const props = withDefaults(defineProps<ErrorBoundaryProps>(), {
  fallbackComponent: undefined,
  showDetails: true,
  showNavigateHome: true,
  maxRetries: 3,
  onError: undefined,
  onRetry: undefined,
  onClear: undefined
});

// Emits
const emit = defineEmits<{
  error: [error: Error, errorInfo: ErrorInfo];
  retry: [attempt: number];
  clear: [];
  report: [error: Error, errorInfo: ErrorInfo];
}>();

// Router for navigation
const router = useRouter();

// Error state
const hasError = ref(false);
const currentError = ref<Error | null>(null);
const errorInfo = ref<ErrorInfo | null>(null);
const retryCount = ref(0);
const isRetrying = ref(false);

// Computed properties
const errorTitle = computed(() => {
  if (!currentError.value) return 'Something went wrong';
  
  // Customize title based on error type
  if (currentError.value.name === 'ChunkLoadError') {
    return 'Loading Error';
  }
  if (currentError.value.name === 'NetworkError') {
    return 'Connection Error';
  }
  if (currentError.value.message.includes('API')) {
    return 'Service Error';
  }
  
  return 'Application Error';
});

const errorMessage = computed(() => {
  if (!currentError.value) return 'An unexpected error occurred';
  
  // User-friendly messages based on error type
  if (currentError.value.name === 'ChunkLoadError') {
    return 'Failed to load application resources. Please refresh the page.';
  }
  if (currentError.value.name === 'NetworkError') {
    return 'Unable to connect to the server. Please check your internet connection.';
  }
  if (currentError.value.message.includes('API')) {
    return 'Unable to communicate with the server. Please try again.';
  }
  
  return 'Something unexpected happened. Please try again or contact support if the problem persists.';
});

const errorDetails = computed(() => {
  if (!currentError.value || !errorInfo.value) return '';
  
  return `Error: ${currentError.value.message}
Stack: ${currentError.value.stack || 'No stack trace available'}
Component: ${errorInfo.value.componentName || 'Unknown'}
Timestamp: ${new Date(errorInfo.value.timestamp).toISOString()}
URL: ${errorInfo.value.url}`;
});

// Error capture hook
onErrorCaptured((error: Error, instance, info) => {
  console.error('🚨 ErrorBoundary caught error:', error);
  console.error('Component instance:', instance);
  console.error('Error info:', info);
  
  // Create error info object
  const errorInfoObj: ErrorInfo = {
    componentName: instance?.$options.name || instance?.$options.__name || 'Unknown',
    propsData: instance?.$props,
    lifecycle: info,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };
  
  // Update error state
  hasError.value = true;
  currentError.value = error;
  errorInfo.value = errorInfoObj;
  
  // Call onError callback if provided
  if (props.onError) {
    props.onError(error, errorInfoObj);
  }
  
  // Emit error event
  emit('error', error, errorInfoObj);
  
  // Prevent the error from propagating further up the component tree
  return false;
});

// Recovery methods
const retry = async () => {
  if (retryCount.value >= props.maxRetries) {
    return;
  }
  
  isRetrying.value = true;
  retryCount.value++;
  
  
  // Call onRetry callback if provided
  if (props.onRetry) {
    props.onRetry();
  }
  
  // Emit retry event
  emit('retry', retryCount.value);
  
  try {
    // Wait a bit before clearing error to allow for any cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Clear error state
    clearError();
    
    // Force re-render
    await nextTick();
  } catch (retryError) {
    console.error('Retry failed:', retryError);
  } finally {
    isRetrying.value = false;
  }
};

const clearError = () => {
  
  hasError.value = false;
  currentError.value = null;
  errorInfo.value = null;
  retryCount.value = 0;
  isRetrying.value = false;
  
  // Call onClear callback if provided
  if (props.onClear) {
    props.onClear();
  }
  
  // Emit clear event
  emit('clear');
};

const reload = () => {
  window.location.reload();
};

const navigateHome = async () => {
  clearError();
  await router.push('/app/agents');
};

const reportError = () => {
  
  if (currentError.value && errorInfo.value) {
    emit('report', currentError.value, errorInfo.value);
    
    // You could also send to an error reporting service here
    // Example: Sentry, LogRocket, etc.
  }
};

// Expose methods for parent components
defineExpose({
  hasError: computed(() => hasError.value),
  currentError: computed(() => currentError.value),
  errorInfo: computed(() => errorInfo.value),
  retry,
  clearError,
  reload,
  navigateHome
});
</script>

<style scoped>
.error-boundary {
  width: 100%;
  height: 100%;
}

.error-boundary__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 20px;
}

.error-boundary__card {
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
}

.error-boundary__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ion-color-danger);
}

.error-boundary__icon {
  font-size: 24px;
}

.error-boundary__subtitle {
  margin-top: 8px;
  color: var(--ion-color-medium);
}

.error-boundary__details {
  margin: 16px 0;
}

.error-boundary__stack {
  padding: 12px;
  background: var(--ion-color-light);
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-boundary__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 20px 0;
}

.error-boundary__actions ion-button {
  flex: 1;
  min-width: 120px;
}

.error-boundary__report {
  margin-top: 16px;
  text-align: center;
  border-top: 1px solid var(--ion-color-light);
  padding-top: 16px;
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .error-boundary__stack {
    background: var(--ion-color-dark);
    color: var(--ion-color-light);
  }
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .error-boundary__actions {
    flex-direction: column;
  }
  
  .error-boundary__actions ion-button {
    flex: none;
    width: 100%;
  }
}
</style>

<template>
  <!--
    App.vue is a thin wrapper — IonApp lives inside the shell pages
    (ForgeShellPage uses OaiAppShell which renders IonApp).
    This avoids nested IonApp conflicts.
  -->
  <div class="app-root">
    <!-- Main application content -->
    <ErrorBoundary
      :show-details="true"
      :max-retries="3"
      @error="onGlobalError"
      :on-retry="onErrorRetry"
      @report="onErrorReport"
    >
      <ion-router-outlet id="main-content"></ion-router-outlet>
    </ErrorBoundary>

    <!-- Global error notifications -->
    <GlobalErrorNotification />

    <!-- User-friendly error boundary -->
    <GlobalErrorBoundary />
  </div>
</template>
<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue';
import { IonRouterOutlet } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { useRbacStore } from '@/stores/rbacStore';
import ErrorBoundary from '@/components/common/ErrorBoundary.vue';
import GlobalErrorNotification from '@/components/common/GlobalErrorNotification.vue';
import GlobalErrorBoundary from '@/components/ErrorHandling/GlobalErrorBoundary.vue';
import { useGlobalErrorHandler } from '@/composables/useGlobalErrorHandler';

// Environment check
const isDevelopment = import.meta.env.DEV;

// Set up global error handling
const {
  errorStore,
  handleVueError,
  getErrorSummary,
  testErrorHandling 
} = useGlobalErrorHandler();

interface ErrorInfo {
  componentName?: string;
  propsData?: Record<string, unknown>;
  lifecycle?: string;
  timestamp: number;
  userAgent: string;
  url: string;
}

interface ErrorDebugContext {
  store: typeof errorStore;
  handler: { handleVueError: typeof handleVueError };
  summary: typeof getErrorSummary;
  test: typeof testErrorHandling;
}

// Global error event handlers
const onGlobalError = (error: Error, errorInfo: ErrorInfo) => {
  console.log('Global error captured:', error, errorInfo);
  // Error is already handled by ErrorBoundary and added to store
  // This is just for additional app-level logic if needed
};

const onErrorRetry = () => {
  console.log('Error retry triggered');
  // You could add app-level retry logic here
  // For example, clearing caches, refreshing auth tokens, etc.
};

const onErrorReport = (error: Error, errorInfo: ErrorInfo) => {
  console.log('Error report requested:', error, errorInfo);
  // Additional reporting logic could go here
  // For example, showing a feedback form, etc.
};

// Router and auth store for session handling
const router = useRouter();
const rbacStore = useRbacStore();

// Handle session-expired events from authenticatedFetch
const handleSessionExpired = async () => {
  console.log('[App] Session expired, logging out and redirecting to login');
  await rbacStore.logout();
  router.push('/login');
};

// Set up global Vue error handler
onMounted(() => {
  // Log initial error summary

  // Listen for session-expired events
  window.addEventListener('auth:session-expired', handleSessionExpired);

  // Test error handling in development
  if (isDevelopment && import.meta.env.VITE_TEST_ERRORS === 'true') {
    setTimeout(() => {
      testErrorHandling();
    }, 5000);
  }
});

// Clean up event listener
onUnmounted(() => {
  window.removeEventListener('auth:session-expired', handleSessionExpired);
});

// Expose error handling for debugging
if (isDevelopment) {
  (window as Window & { errorDebug?: ErrorDebugContext }).errorDebug = {
    store: errorStore,
    handler: { handleVueError },
    summary: getErrorSummary,
    test: testErrorHandling
  };
}
</script>
<style>
@import '@/styles/components.css';
@import '@/styles/animations.css';

.app-root {
  display: contents;
}
</style>

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
    >
      <ion-router-outlet id="main-content"></ion-router-outlet>
    </ErrorBoundary>

  </div>
</template>
<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue';
import { IonRouterOutlet } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { useRbacStore } from '@/stores/rbacStore';
import ErrorBoundary from '@/components/common/ErrorBoundary.vue';
// Router and auth store for session handling
const router = useRouter();
const rbacStore = useRbacStore();

// Handle session-expired events from authenticatedFetch
const handleSessionExpired = async () => {
  console.log('[App] Session expired, logging out and redirecting to login');
  await rbacStore.logout();
  router.push('/login');
};

onMounted(() => {
  // Listen for session-expired events
  window.addEventListener('auth:session-expired', handleSessionExpired);
});

// Clean up event listener
onUnmounted(() => {
  window.removeEventListener('auth:session-expired', handleSessionExpired);
});
</script>
<style>
@import '@/styles/components.css';
@import '@/styles/animations.css';

.app-root {
  display: contents;
}
</style>

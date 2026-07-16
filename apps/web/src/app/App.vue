<template>
  <div class="app-root">
    <ion-router-outlet id="app-root"></ion-router-outlet>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { IonRouterOutlet } from '@ionic/vue';
import { useRouter } from 'vue-router';
import { useRbacStore } from '@/stores/rbacStore';

const router = useRouter();
const rbacStore = useRbacStore();

const handleSessionExpired = async () => {
  await rbacStore.logout();
  router.push('/login');
};

onMounted(() => {
  window.addEventListener('auth:session-expired', handleSessionExpired);
});

onUnmounted(() => {
  window.removeEventListener('auth:session-expired', handleSessionExpired);
});
</script>

<style>
.app-root {
  display: contents;
}
</style>

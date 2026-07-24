<template>
  <!-- IonPage root registers this view with the root ion-router-outlet.
       The inner div is the scroll container (IonPage clips overflow). -->
  <ion-page>
    <div class="landing-shell">
      <router-view />
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage } from '@ionic/vue';
import './styles/global.css';
</script>

<style scoped>
.landing-shell {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>

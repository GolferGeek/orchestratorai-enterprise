<template>
  <ion-page>
    <ion-content class="module-page-content">
      <slot />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
// Every component rendered directly by an ion-router-outlet must root with
// <ion-page> so Ionic can register the page element for transitions.
// Views without it break navigation ("can't access property classList").
import { IonPage, IonContent } from '@ionic/vue';
</script>

<style scoped>
.module-page-content {
  --background: var(--oai-bg-page, #0f172a);
  --color: var(--oai-text-primary, #e2e8f0);
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
}
</style>

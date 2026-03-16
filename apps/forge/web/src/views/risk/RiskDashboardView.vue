<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Risk Runner Dashboard</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <RiskAgentPane />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/vue';
import RiskAgentPane from '@/components/AgentPanes/Risk/RiskAgentPane.vue';
</script>

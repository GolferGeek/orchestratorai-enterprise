<template>
  <ion-card class="agent-list-card">
    <ion-card-header>
      <ion-card-title>Available Agents</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <div v-if="!agents || agents.length === 0" class="empty-list-message">
        <p>No agents currently available to display.</p>
      </div>
      <ion-list v-else lines="inset">
        <ion-item v-for="agent in agents" :key="agent.id" class="agent-item">
          <ion-label>
            <h2>{{ formatAgentName(agent.name) }}</h2>
            <p>{{ formatAgentDescription(agent.description) }}</p>
          </ion-label>
          <!-- Could add buttons here for more info or direct interaction later -->
        </ion-item>
      </ion-list>
    </ion-card-content>
  </ion-card>
</template>
<script setup lang="ts">
import { defineProps, PropType } from 'vue';
import { AgentInfo } from '../types/chat';
import { formatAgentName, formatAgentDescription } from '@/utils/caseConverter';
import { IonList, IonItem, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent } from '@ionic/vue';
defineProps({
  agents: {
    type: Array as PropType<AgentInfo[]>,
    required: true,
  },
});
</script>
<style scoped>
.agent-list-card {
  margin: 10px 0; /* Add some margin if used directly in a list */
  /* Or it could be styled to appear like a special message bubble */
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}
.empty-list-message {
  text-align: center;
  padding: 10px;
  color: var(--ion-color-medium-shade);
}
.agent-item h2 {
  font-weight: bold;
  color: var(--ion-color-dark);
  margin-bottom: 4px;
}
.agent-item p {
  font-size: 0.9em;
  white-space: normal; /* Allow description to wrap */
}
</style> 
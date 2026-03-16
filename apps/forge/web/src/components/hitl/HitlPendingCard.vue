<template>
  <div class="hitl-pending-card" @click="emit('review')">
    <div class="card-icon">
      <ion-icon :icon="alertCircleOutline" color="warning" />
    </div>
    <div class="card-content">
      <div class="card-title">HITL Review Needed</div>
      <div class="card-topic">{{ topic }}</div>
      <div class="card-meta">
        <span class="agent">{{ agentSlug }}</span>
        <span class="version">v{{ versionNumber }}</span>
        <span class="time">{{ formattedTime }}</span>
      </div>
    </div>
    <ion-button fill="clear" size="small">
      Review
      <ion-icon :icon="arrowForwardOutline" slot="end" />
    </ion-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon, IonButton } from '@ionic/vue';
import { alertCircleOutline, arrowForwardOutline } from 'ionicons/icons';
import type { HitlPendingCardProps, HitlPendingCardEmits } from '@/components/shared/types';
import { formatDistanceToNow } from 'date-fns';

const props = defineProps<HitlPendingCardProps>();
const emit = defineEmits<HitlPendingCardEmits>();

const formattedTime = computed(() => {
  return formatDistanceToNow(new Date(props.pendingSince), { addSuffix: true });
});
</script>

<style scoped>
.hitl-pending-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--ion-color-warning-tint);
  border-left: 4px solid var(--ion-color-warning);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.hitl-pending-card:hover {
  background: var(--ion-color-warning-shade);
}

.card-icon ion-icon {
  font-size: 2rem;
}

.card-content {
  flex: 1;
}

.card-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--ion-color-warning-shade);
}

.card-topic {
  font-size: 1rem;
  margin: 0.25rem 0;
}

.card-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}
</style>

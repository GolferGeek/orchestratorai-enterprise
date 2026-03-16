<template>
  <div class="deliverable-card" @click="emit('view')">
    <div class="card-icon">
      <ion-icon :icon="documentTextOutline" color="success" />
    </div>
    <div class="card-content">
      <div class="card-title">Deliverable Ready</div>
      <div class="card-topic">{{ title }}</div>
      <div class="card-meta">
        <VersionBadge
          :version-number="currentVersionNumber"
          :creation-type="creationType"
          :is-current="true"
          size="small"
        />
        <span class="time">{{ formattedTime }}</span>
      </div>
    </div>
    <ion-button fill="clear" size="small">
      View
      <ion-icon :icon="arrowForwardOutline" slot="end" />
    </ion-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon, IonButton } from '@ionic/vue';
import { documentTextOutline, arrowForwardOutline } from 'ionicons/icons';
import VersionBadge from '@/components/shared/VersionBadge.vue';
import type { DeliverableCardProps, DeliverableCardEmits } from '@/components/shared/types';
import { formatDistanceToNow } from 'date-fns';

const props = defineProps<DeliverableCardProps>();
const emit = defineEmits<DeliverableCardEmits>();

const formattedTime = computed(() => {
  return formatDistanceToNow(new Date(props.updatedAt), { addSuffix: true });
});
</script>

<style scoped>
.deliverable-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--ion-color-success-tint);
  border-left: 4px solid var(--ion-color-success);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.deliverable-card:hover {
  background: var(--ion-color-success-shade);
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
  color: var(--ion-color-success-shade);
}

.card-topic {
  font-size: 1rem;
  margin: 0.25rem 0;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}
</style>

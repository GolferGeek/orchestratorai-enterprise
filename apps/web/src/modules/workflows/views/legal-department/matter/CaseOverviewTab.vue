<template>
  <div class="case-overview">
    <div v-if="loading" class="loading-state">
      <ion-spinner />
      <p>Loading entities...</p>
    </div>

    <div v-else-if="entities.length === 0" class="empty-state">
      <ion-icon :icon="peopleOutline" size="large" color="medium" />
      <p>No entities extracted yet.</p>
      <p class="hint">Upload documents and wait for processing to complete.</p>
    </div>

    <div v-else>
      <div v-for="(group, type) in groupedEntities" :key="type" class="entity-group">
        <h3 class="entity-type-header">
          <ion-badge color="primary">{{ type }}</ion-badge>
          <span class="count">{{ group.length }}</span>
        </h3>
        <ion-list>
          <ion-item v-for="entity in group" :key="entity.id">
            <ion-label>
              <h3>{{ entity.name }}</h3>
              <p v-if="entity.role" class="entity-role">{{ entity.role }}</p>
              <p v-if="entity.description" class="entity-desc">{{ entity.description }}</p>
            </ion-label>
            <ion-badge slot="end" color="light">
              {{ entity.source_document_ids.length }} doc{{ entity.source_document_ids.length !== 1 ? 's' : '' }}
            </ion-badge>
          </ion-item>
        </ion-list>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { IonSpinner, IonIcon, IonList, IonItem, IonLabel, IonBadge } from '@ionic/vue';
import { peopleOutline } from 'ionicons/icons';
import { legalJobsService, type MatterEntityRow } from '../legalJobsService';

const props = defineProps<{
  matterId: string;
  orgSlug: string;
}>();

const entities = ref<MatterEntityRow[]>([]);
const loading = ref(false);

const groupedEntities = computed(() => {
  const groups: Record<string, MatterEntityRow[]> = {};
  for (const e of entities.value) {
    if (!groups[e.entity_type]) groups[e.entity_type] = [];
    groups[e.entity_type]!.push(e);
  }
  return groups;
});

async function load() {
  loading.value = true;
  try {
    entities.value = await legalJobsService.getMatterEntities(
      props.matterId,
      props.orgSlug,
    );
  } finally {
    loading.value = false;
  }
}

defineExpose({ load });
onMounted(load);
</script>

<style scoped>
.case-overview {
  padding: 16px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;
  color: var(--ion-color-medium);
}

.hint {
  font-size: 0.875rem;
}

.entity-group {
  margin-bottom: 24px;
}

.entity-type-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  text-transform: capitalize;
}

.count {
  font-size: 0.875rem;
  color: var(--ion-color-medium);
}

.entity-role {
  font-size: 0.875rem;
  color: var(--ion-color-primary);
}

.entity-desc {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}
</style>

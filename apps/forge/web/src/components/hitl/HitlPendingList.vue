<template>
  <div class="hitl-pending-list">
    <div class="list-header" @click="toggleExpanded">
      <ion-icon :icon="alertCircleOutline" color="warning" />
      <span class="header-label">HITL Reviews</span>
      <ion-badge v-if="count > 0" color="warning">{{ count }}</ion-badge>
      <ion-icon
        :icon="expanded ? chevronUpOutline : chevronDownOutline"
        class="expand-icon"
      />
    </div>

    <div v-if="expanded" class="list-content">
      <ion-spinner v-if="loading" name="dots" />

      <div v-else-if="!hasItems" class="empty-state">
        No pending reviews
      </div>

      <div v-else class="pending-items">
        <div
          v-for="item in sortedItems"
          :key="item.taskId"
          class="pending-item"
          @click="handleItemClick(item)"
        >
          <div class="item-title">{{ item.deliverableTitle || item.conversationTitle }}</div>
          <div class="item-meta">
            <span class="agent">{{ item.agentSlug }}</span>
            <span class="time">{{ formatTime(item.pendingSince) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { IonIcon, IonBadge, IonSpinner } from '@ionic/vue';
import { alertCircleOutline, chevronUpOutline, chevronDownOutline } from 'ionicons/icons';
import { useHitlPendingStore } from '@/stores/hitlPendingStore';
import { formatDistanceToNow } from 'date-fns';
import type { HitlPendingItem } from '@orchestrator-ai/transport-types';

const emit = defineEmits<{
  select: [item: HitlPendingItem];
}>();

const hitlPendingStore = useHitlPendingStore();
const { count, hasItems, sortedItems, loading } = storeToRefs(hitlPendingStore);

const expanded = ref(true);

const toggleExpanded = () => {
  expanded.value = !expanded.value;
};

const handleItemClick = (item: HitlPendingItem) => {
  emit('select', item);
};

const formatTime = (dateStr: string) => {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
};

// Fetch pending reviews on mount
onMounted(() => {
  hitlPendingStore.fetchPendingReviews();
});
</script>

<style scoped>
.hitl-pending-list {
  background: var(--ion-color-step-50);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.list-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  cursor: pointer;
  font-weight: 600;
}

.list-header ion-icon:first-child {
  font-size: 1.25rem;
}

.header-label {
  flex: 1;
}

.expand-icon {
  font-size: 1rem;
  color: var(--ion-color-medium);
}

.list-content {
  padding: 0 0.75rem 0.75rem;
}

.empty-state {
  text-align: center;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  padding: 1rem;
}

.pending-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pending-item {
  padding: 0.5rem 0.75rem;
  background: var(--ion-background-color);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.pending-item:hover {
  background: var(--ion-color-step-100);
}

.item-title {
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}
</style>

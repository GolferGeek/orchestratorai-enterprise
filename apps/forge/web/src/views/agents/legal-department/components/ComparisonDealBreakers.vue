<template>
  <div class="deal-breakers">
    <div v-if="dealBreakers.length === 0" class="no-breakers">
      <span class="check-icon">&#10003;</span>
      No deal-breakers found across any compared rooms.
    </div>

    <div v-else>
      <div class="sort-controls">
        <span>Sort by:</span>
        <button
          :class="{ active: sortBy === 'room' }"
          @click="sortBy = 'room'"
        >Room</button>
        <button
          :class="{ active: sortBy === 'category' }"
          @click="sortBy = 'category'"
        >Category</button>
      </div>

      <div v-for="group in groupedBreakers" :key="group.label" class="group">
        <h3 class="group-label">{{ group.label }}</h3>
        <div
          v-for="(db, idx) in group.items"
          :key="idx"
          class="breaker-card"
        >
          <div class="breaker-header">
            <ion-badge color="danger">{{ db.category }}</ion-badge>
            <span v-if="sortBy === 'category'" class="room-tag">{{ db.targetCompany }}</span>
          </div>
          <p class="finding">{{ db.finding }}</p>
          <p class="recommendation"><strong>Recommendation:</strong> {{ db.recommendation }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { IonBadge } from '@ionic/vue';
import type { ComparisonDealBreaker, ComparisonRoomSummary } from '../legalJobsService';

const props = defineProps<{
  dealBreakers: ComparisonDealBreaker[];
  rooms: ComparisonRoomSummary[];
}>();

const sortBy = ref<'room' | 'category'>('room');

const groupedBreakers = computed(() => {
  const items = [...props.dealBreakers];
  if (sortBy.value === 'room') {
    const byRoom = new Map<string, ComparisonDealBreaker[]>();
    for (const db of items) {
      const key = db.targetCompany;
      if (!byRoom.has(key)) byRoom.set(key, []);
      byRoom.get(key)!.push(db);
    }
    return Array.from(byRoom.entries()).map(([label, group]) => ({
      label,
      items: group,
    }));
  } else {
    const byCat = new Map<string, ComparisonDealBreaker[]>();
    for (const db of items) {
      const key = db.category;
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(db);
    }
    return Array.from(byCat.entries()).map(([label, group]) => ({
      label,
      items: group,
    }));
  }
});
</script>

<style scoped>
.no-breakers {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: #22c55e;
  font-size: 1.1em;
}

.check-icon {
  font-size: 1.5em;
  font-weight: bold;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 0.85em;
}

.sort-controls button {
  background: none;
  border: 1px solid var(--ion-color-light-shade, #444);
  color: var(--ion-text-color, #ccc);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.sort-controls button.active {
  background: var(--ion-color-primary);
  color: white;
  border-color: var(--ion-color-primary);
}

.group {
  margin-bottom: 16px;
}

.group-label {
  font-size: 1em;
  margin: 0 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ion-color-light-shade, #333);
}

.breaker-card {
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--ion-color-light-shade, #333);
  border-radius: 6px;
  border-left: 3px solid #ef4444;
}

.breaker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.room-tag {
  font-size: 0.8em;
  color: var(--ion-color-medium);
}

.finding {
  margin: 0 0 4px;
}

.recommendation {
  margin: 0;
  font-size: 0.9em;
  color: var(--ion-color-medium);
}
</style>

<template>
  <div class="fortification-diff">
    <div v-if="!original && !fortified" class="empty-state">
      No brief content available.
    </div>

    <template v-else>
      <div class="diff-header">
        <ion-segment v-model="viewMode">
          <ion-segment-button value="side-by-side">
            Side by Side
          </ion-segment-button>
          <ion-segment-button value="fortified">
            Fortified Only
          </ion-segment-button>
          <ion-segment-button value="original">
            Original Only
          </ion-segment-button>
        </ion-segment>
      </div>

      <div
        v-if="viewMode === 'side-by-side'"
        class="diff-panels"
      >
        <div class="diff-panel original-panel">
          <div class="panel-label">Original Brief</div>
          <div class="panel-content">
            <pre>{{ original || 'No original brief' }}</pre>
          </div>
        </div>
        <div class="diff-panel fortified-panel">
          <div class="panel-label">
            Fortified Brief
            <ion-badge color="success" v-if="fortified">Updated</ion-badge>
          </div>
          <div class="panel-content">
            <pre>{{ fortified || 'No fortification applied' }}</pre>
          </div>
        </div>
      </div>

      <div v-else-if="viewMode === 'fortified'" class="single-panel">
        <div class="panel-label">
          Fortified Brief
          <ion-badge color="success" v-if="fortified">Updated</ion-badge>
        </div>
        <div class="panel-content">
          <pre>{{ fortified || 'No fortification applied' }}</pre>
        </div>
      </div>

      <div v-else class="single-panel">
        <div class="panel-label">Original Brief</div>
        <div class="panel-content">
          <pre>{{ original || 'No original brief' }}</pre>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonSegment, IonSegmentButton, IonBadge } from '@ionic/vue';

defineProps<{
  original: string | null;
  fortified: string | null;
}>();

const viewMode = ref<'side-by-side' | 'fortified' | 'original'>('side-by-side');
</script>

<style scoped>
.fortification-diff {
  padding: 16px;
}

.empty-state {
  color: var(--ion-color-medium);
  padding: 24px;
  text-align: center;
}

.diff-header {
  margin-bottom: 12px;
}

.diff-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.diff-panel,
.single-panel {
  border: 1px solid var(--ion-color-step-200);
  border-radius: 6px;
  overflow: hidden;
}

.original-panel {
  border-top: 3px solid var(--ion-color-medium);
}

.fortified-panel {
  border-top: 3px solid var(--ion-color-success);
}

.panel-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-weight: 600;
  font-size: 13px;
  background: var(--ion-color-step-50);
  border-bottom: 1px solid var(--ion-color-step-150);
}

.panel-content {
  padding: 12px;
  max-height: 600px;
  overflow-y: auto;
}

.panel-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 13px;
  line-height: 1.6;
  font-family: inherit;
  color: var(--ion-text-color);
}
</style>

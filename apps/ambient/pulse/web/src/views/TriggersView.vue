<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { usePulseStore } from '../stores/pulse.store';
import type { TriggerDefinition } from '../stores/pulse.store';

const store = usePulseStore();

const showCreateForm = ref(false);
const newTriggerName = ref('');
const newTriggerSource = ref('db');
const newTriggerCooldown = ref(60);
const createError = ref<string | null>(null);

onMounted(async () => {
  await store.fetchTriggers();
});

function formatTime(ts: string | null): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString();
}

function sourceTypeColor(sourceType: string): string {
  switch (sourceType) {
    case 'db': return 'bg-blue-900 text-blue-300';
    case 'file': return 'bg-yellow-900 text-yellow-300';
    case 'a2a': return 'bg-purple-900 text-purple-300';
    case 'schedule': return 'bg-cyan-900 text-cyan-300';
    default: return 'bg-gray-700 text-gray-400';
  }
}

async function toggleTrigger(trigger: TriggerDefinition) {
  await store.toggleTrigger(trigger.id, !trigger.enabled);
}

function cancelCreate() {
  showCreateForm.value = false;
  newTriggerName.value = '';
  newTriggerSource.value = 'db';
  newTriggerCooldown.value = 60;
  createError.value = null;
}
</script>

<template>
  <IonPage>
    <IonContent style="--background: var(--oai-bg-page, #0f172a)">
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-white">Triggers</h1>
            <p class="text-gray-400 text-sm mt-1">
              Trigger definitions that fire workflows in response to internal events.
            </p>
          </div>
          <button class="btn-primary" @click="showCreateForm = !showCreateForm">
            {{ showCreateForm ? 'Cancel' : 'Create Trigger' }}
          </button>
        </div>

        <!-- Create form -->
        <div v-if="showCreateForm" class="card border border-purple-700/50">
          <h2 class="text-sm font-semibold text-gray-200 mb-4">New Trigger</h2>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Name</label>
              <input
                v-model="newTriggerName"
                type="text"
                placeholder="e.g. on-task-insert"
                class="input-field w-full"
              />
            </div>
            <div class="flex gap-3">
              <div class="flex-1">
                <label class="block text-xs text-gray-400 mb-1">Source Type</label>
                <select v-model="newTriggerSource" class="input-field w-full">
                  <option value="db">Database</option>
                  <option value="file">File System</option>
                  <option value="a2a">A2A Message</option>
                  <option value="schedule">Schedule</option>
                </select>
              </div>
              <div class="flex-1">
                <label class="block text-xs text-gray-400 mb-1">Cooldown (seconds)</label>
                <input
                  v-model.number="newTriggerCooldown"
                  type="number"
                  min="0"
                  class="input-field w-full"
                />
              </div>
            </div>
            <div v-if="createError" class="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
              {{ createError }}
            </div>
            <div class="flex gap-2">
              <button class="btn-primary" @click="cancelCreate">Save Trigger</button>
              <button class="btn-secondary" @click="cancelCreate">Cancel</button>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-3">
            Note: Trigger creation via UI is a placeholder. Configure triggers via the API or workflow definitions.
          </p>
        </div>

        <!-- Summary row -->
        <div class="grid grid-cols-3 gap-4">
          <div class="card">
            <div class="text-xs text-gray-400 mb-1">Total Triggers</div>
            <div class="text-2xl font-bold text-purple-400">{{ store.triggers.length }}</div>
          </div>
          <div class="card">
            <div class="text-xs text-gray-400 mb-1">Active</div>
            <div class="text-2xl font-bold text-green-400">{{ store.triggers.filter((t) => t.enabled).length }}</div>
          </div>
          <div class="card">
            <div class="text-xs text-gray-400 mb-1">Inactive</div>
            <div class="text-2xl font-bold text-gray-400">{{ store.triggers.filter((t) => !t.enabled).length }}</div>
          </div>
        </div>

        <!-- Trigger list -->
        <div class="card">
          <h2 class="text-sm font-semibold text-gray-300 mb-4">Registered Triggers</h2>

          <div v-if="store.loading" class="text-gray-500 text-sm text-center py-6">
            Loading triggers...
          </div>
          <div v-else-if="store.triggers.length === 0" class="text-gray-500 text-sm text-center py-6">
            No triggers registered. Triggers are defined by workflow configurations.
          </div>
          <div v-else class="divide-y divide-gray-700">
            <div
              v-for="trigger in store.triggers"
              :key="trigger.id"
              class="py-4 flex items-center justify-between"
            >
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span :class="['status-badge', sourceTypeColor(trigger.sourceType)]">
                    {{ trigger.sourceType }}
                  </span>
                  <span :class="['status-badge', trigger.enabled ? 'status-active' : 'status-inactive']">
                    {{ trigger.enabled ? 'Enabled' : 'Disabled' }}
                  </span>
                  <span class="text-sm font-medium text-gray-200">{{ trigger.name }}</span>
                </div>
                <div class="text-xs text-gray-500">
                  Cooldown: {{ trigger.cooldownSeconds }}s
                  &bull; Fired: {{ trigger.executionCount }} times
                  &bull; Last fired: {{ formatTime(trigger.lastFiredAt) }}
                </div>
              </div>
              <button
                :class="trigger.enabled ? 'btn-secondary' : 'btn-primary'"
                class="text-xs ml-4"
                @click="toggleTrigger(trigger)"
              >
                {{ trigger.enabled ? 'Disable' : 'Enable' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>

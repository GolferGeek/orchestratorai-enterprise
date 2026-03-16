<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { usePulseStore } from '../stores/pulse.store';

const store = usePulseStore();
const simulateDbTable = ref('');
const simulateDbEvent = ref<'INSERT' | 'UPDATE' | 'DELETE'>('INSERT');
const simulateFilePath = ref('');
const simulateFileEvent = ref<'created' | 'modified' | 'deleted'>('created');
const simResult = ref<string | null>(null);

onMounted(() => store.fetchListeners());

async function doSimulateDb() {
  if (!simulateDbTable.value.trim()) return;
  simResult.value = null;
  await store.simulateDbEvent(simulateDbTable.value, simulateDbEvent.value);
  simResult.value = `DB event simulated: ${simulateDbEvent.value} on ${simulateDbTable.value}`;
}

async function doSimulateFile() {
  if (!simulateFilePath.value.trim()) return;
  simResult.value = null;
  await store.simulateFileEvent(simulateFilePath.value, simulateFileEvent.value);
  simResult.value = `File event simulated: ${simulateFileEvent.value} at ${simulateFilePath.value}`;
}
</script>

<template>
  <IonPage>
    <IonContent style="--background: var(--oai-bg-page, #0f172a)">
      <div class="space-y-6">
        <h1 class="text-2xl font-bold text-white">Event Listeners</h1>

        <!-- Listener list -->
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-200 mb-4">Registered Listeners</h2>
          <div v-if="store.listeners.length === 0" class="text-gray-500 text-sm text-center py-6">
            No listeners registered.
          </div>
          <div v-else class="divide-y divide-gray-700">
            <div
              v-for="listener in store.listeners"
              :key="listener.id"
              class="py-4 flex items-center justify-between"
            >
              <div>
                <div class="flex items-center gap-2">
                  <span :class="listener.active ? 'status-active' : 'status-inactive'">
                    {{ listener.active ? 'Active' : 'Inactive' }}
                  </span>
                  <span class="text-sm font-medium text-gray-200">{{ listener.name }}</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  Type: {{ listener.type }} &bull; Fired: {{ listener.firingCount }} times
                </div>
                <div v-if="listener.lastFiredAt" class="text-xs text-gray-600 mt-0.5">
                  Last fired: {{ new Date(listener.lastFiredAt).toLocaleTimeString() }}
                </div>
              </div>
              <span class="text-xs font-mono text-gray-500">{{ listener.id }}</span>
            </div>
          </div>
        </div>

        <!-- Simulation tools -->
        <div class="card">
          <h2 class="text-lg font-semibold text-gray-200 mb-4">Simulate Events</h2>
          <p class="text-sm text-gray-400 mb-4">
            Use these tools to manually trigger listener events for development and testing.
          </p>

          <!-- DB simulation -->
          <div class="mb-6">
            <h3 class="text-sm font-semibold text-gray-300 mb-3">Database Change Event</h3>
            <div class="flex gap-3">
              <input
                v-model="simulateDbTable"
                type="text"
                placeholder="Table name (e.g. tasks)"
                class="input-field flex-1"
              />
              <select v-model="simulateDbEvent" class="input-field">
                <option value="INSERT">INSERT</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
              </select>
              <button class="btn-primary" @click="doSimulateDb">Simulate</button>
            </div>
          </div>

          <!-- File simulation -->
          <div>
            <h3 class="text-sm font-semibold text-gray-300 mb-3">File System Event</h3>
            <div class="flex gap-3">
              <input
                v-model="simulateFilePath"
                type="text"
                placeholder="File path (e.g. /data/output.json)"
                class="input-field flex-1"
              />
              <select v-model="simulateFileEvent" class="input-field">
                <option value="created">Created</option>
                <option value="modified">Modified</option>
                <option value="deleted">Deleted</option>
              </select>
              <button class="btn-primary" @click="doSimulateFile">Simulate</button>
            </div>
          </div>

          <div v-if="simResult" class="mt-4 p-3 bg-green-900/30 border border-green-700 rounded text-green-300 text-sm">
            {{ simResult }}
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import { useSse } from '../composables/useSse';

const { connected, events, connect } = useSse();

onMounted(() => {
  connect();
});

function eventTypeColor(type: string): string {
  if (type.startsWith('workflow.')) return 'text-purple-400';
  if (type.startsWith('listener.')) return 'text-cyan-400';
  if (type === 'heartbeat') return 'text-gray-600';
  if (type === 'connected') return 'text-green-400';
  return 'text-gray-400';
}
</script>

<template>
  <IonPage>
    <IonContent style="--background: var(--oai-bg-page, #0f172a)">
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-white">Event Stream</h1>
            <p class="text-gray-400 text-sm mt-1">
              Real-time SSE events from Pulse API — platform-standard format (text/event-stream).
            </p>
          </div>
          <span :class="['status-badge', connected ? 'status-active' : 'status-inactive']">
            {{ connected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>

        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Live Events</h2>
            <span class="text-xs text-gray-500">{{ events.length }} events buffered</span>
          </div>

          <div class="font-mono text-xs space-y-1 max-h-[600px] overflow-y-auto">
            <div v-if="events.length === 0" class="text-gray-600 py-4 text-center">
              Waiting for events...
            </div>
            <div
              v-for="(event, i) in events"
              :key="i"
              class="flex items-start gap-3 py-1.5 border-b border-gray-800"
            >
              <span class="text-gray-600 w-20 flex-shrink-0">
                {{ new Date(event.timestamp).toLocaleTimeString() }}
              </span>
              <span :class="['w-40 flex-shrink-0', eventTypeColor(event.type)]">
                {{ event.type }}
              </span>
              <span class="text-gray-500 break-all">
                {{ JSON.stringify(event.data) }}
              </span>
            </div>
          </div>
        </div>

        <!-- SSE format reference -->
        <div class="card bg-gray-800/50">
          <h2 class="text-sm font-semibold text-gray-300 mb-3">Platform-Standard SSE Format</h2>
          <pre class="text-xs text-gray-400 whitespace-pre-wrap">GET /api/streaming/events
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"connected","timestamp":"..."}\n\n
data: {"type":"listener.fired","timestamp":"...","data":{...}}\n\n
data: {"type":"workflow.triggered","timestamp":"...","data":{...}}\n\n</pre>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useMessagesStore } from '../../stores/messages.store';
import type { AuditEntry } from '../../types';

const messagesStore = useMessagesStore();

const verificationState = ref<Record<number, 'pending' | 'verified' | 'broken'>>({});
const isVerifying = ref(false);

const AGENT_NAMES = [
  'ResearchHub',
  'MarketPulse',
  'ContentForge',
  'AgentConsumer',
  'ProtocolAPI',
];

function deterministicHash(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  // produce 64-char-looking hash by repeating/expanding
  return (hex + hex + hex + hex + hex + hex + hex + hex).slice(0, 64);
}

const auditEntries = computed<AuditEntry[]>(() => {
  const EVENT_TYPES: AuditEntry['eventType'][] = [
    'message_sent',
    'message_received',
    'trust_updated',
    'payment_processed',
    'config_changed',
  ];

  const baseEntries: Omit<AuditEntry, 'hash' | 'previousHash'>[] = [];

  // Derive entries from real messages in the store
  messagesStore.messages.slice(0, 8).forEach((msg, idx) => {
    baseEntries.push({
      sequence: idx + 1,
      eventType: idx % 2 === 0 ? 'message_sent' : 'message_received',
      agentName: msg.source,
      timestamp: msg.timestamp,
    });
  });

  // Fill up to 13 entries with deterministic mock data
  const needed = Math.max(0, 13 - baseEntries.length);
  const now = Date.now();
  for (let i = 0; i < needed; i++) {
    const seq = baseEntries.length + 1 + i;
    baseEntries.push({
      sequence: seq,
      eventType: EVENT_TYPES[seq % EVENT_TYPES.length],
      agentName: AGENT_NAMES[seq % AGENT_NAMES.length],
      timestamp: new Date(now - (needed - i) * 47_000).toISOString(),
    });
  }

  // Sort by sequence and build hash chain
  const sorted = baseEntries.sort((a, b) => a.sequence - b.sequence);
  const result: AuditEntry[] = [];
  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (const entry of sorted) {
    const seed = `${entry.sequence}:${entry.eventType}:${entry.agentName}:${entry.timestamp}:${prevHash}`;
    const hash = deterministicHash(seed);
    result.push({ ...entry, hash, previousHash: prevHash });
    prevHash = hash;
  }

  return result;
});

function truncateHash(hash: string): string {
  return hash.slice(0, 16);
}

function eventTypeColor(eventType: AuditEntry['eventType']): string {
  switch (eventType) {
    case 'message_sent': return 'bg-blue-600 text-blue-100';
    case 'message_received': return 'bg-green-700 text-green-100';
    case 'trust_updated': return 'bg-teal-700 text-teal-100';
    case 'payment_processed': return 'bg-yellow-700 text-yellow-100';
    case 'config_changed': return 'bg-purple-700 text-purple-100';
    default: return 'bg-gray-600 text-gray-100';
  }
}

function eventTypeLabel(eventType: AuditEntry['eventType']): string {
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function entryVerificationClass(seq: number): string {
  const state = verificationState.value[seq];
  if (state === 'verified') return 'border-green-500 bg-green-900/20';
  if (state === 'broken') return 'border-red-500 bg-red-900/20';
  return 'border-gray-600 bg-gray-800';
}

async function verifyChain() {
  if (isVerifying.value) return;
  isVerifying.value = true;
  verificationState.value = {};

  const entries = auditEntries.value;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    // Recompute expected hash
    const seed = `${entry.sequence}:${entry.eventType}:${entry.agentName}:${entry.timestamp}:${entry.previousHash}`;
    const expectedHash = deterministicHash(seed);

    // Check if previous-hash linkage is intact
    const prevHashOk = i === 0
      ? entry.previousHash === '0000000000000000000000000000000000000000000000000000000000000000'
      : entry.previousHash === entries[i - 1].hash;

    const valid = entry.hash === expectedHash && prevHashOk;

    // Animate one by one
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    verificationState.value = {
      ...verificationState.value,
      [entry.sequence]: valid ? 'verified' : 'broken',
    };
  }

  isVerifying.value = false;
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-white">Audit Trail</h2>
        <p class="text-xs text-gray-400 mt-0.5">
          Hash-chained log of all protocol events. Each entry links to the previous via its hash.
        </p>
      </div>
      <button
        class="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors"
        :class="isVerifying ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'"
        :disabled="isVerifying"
        @click="verifyChain"
      >
        <svg v-if="isVerifying" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {{ isVerifying ? 'Verifying...' : 'Verify Chain' }}
      </button>
    </div>

    <div class="relative">
      <!-- Vertical timeline spine -->
      <div class="absolute left-5 top-0 bottom-0 w-px bg-gray-600 z-0" />

      <div class="space-y-0">
        <div
          v-for="(entry, idx) in auditEntries"
          :key="entry.sequence"
          class="relative flex gap-4 pb-0"
        >
          <!-- Timeline dot -->
          <div class="relative z-10 flex-shrink-0 flex flex-col items-center">
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors duration-300"
              :class="[
                verificationState[entry.sequence] === 'verified'
                  ? 'border-green-500 bg-green-900 text-green-300'
                  : verificationState[entry.sequence] === 'broken'
                    ? 'border-red-500 bg-red-900 text-red-300'
                    : 'border-gray-500 bg-gray-700 text-gray-300',
              ]"
            >
              <template v-if="verificationState[entry.sequence] === 'verified'">
                <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </template>
              <template v-else-if="verificationState[entry.sequence] === 'broken'">
                <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </template>
              <template v-else>
                {{ entry.sequence }}
              </template>
            </div>
          </div>

          <!-- Entry card -->
          <div
            class="flex-1 mb-3 rounded-lg border p-3 transition-colors duration-300"
            :class="entryVerificationClass(entry.sequence)"
          >
            <!-- Top row: event type badge + agent + timestamp -->
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span
                class="px-2 py-0.5 rounded text-xs font-medium"
                :class="eventTypeColor(entry.eventType)"
              >
                {{ eventTypeLabel(entry.eventType) }}
              </span>
              <span class="text-sm text-gray-200 font-medium">{{ entry.agentName }}</span>
              <span class="ml-auto text-xs text-gray-400">{{ formatTimestamp(entry.timestamp) }}</span>
            </div>

            <!-- Hash chain row -->
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500 w-20 shrink-0">Hash</span>
                <code class="text-xs font-mono text-emerald-400 bg-gray-900 px-2 py-0.5 rounded tracking-wide">
                  {{ truncateHash(entry.hash) }}&hellip;
                </code>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500 w-20 shrink-0">Prev Hash</span>
                <code
                  class="text-xs font-mono bg-gray-900 px-2 py-0.5 rounded tracking-wide"
                  :class="idx === 0 ? 'text-gray-600' : 'text-gray-400'"
                >
                  {{ truncateHash(entry.previousHash) }}&hellip;
                </code>
                <!-- Chain link icon for non-genesis entries -->
                <svg
                  v-if="idx > 0"
                  class="w-3 h-3 text-gray-600 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="auditEntries.length === 0" class="text-center py-12">
      <p class="text-gray-400 text-sm">No audit entries available. Send some messages to populate the trail.</p>
    </div>
  </div>
</template>

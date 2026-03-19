<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useApi } from '../../composables/useApi';
import { useAuthStore } from '../../stores/auth.store';

interface AsyncPattern {
  id: string;
  name: string;
  description: string;
  agents: { from: string; to: string; returnLabel?: string };
  style: 'one-way' | 'two-way' | 'callback' | 'streaming' | 'polling';
}

const patterns: AsyncPattern[] = [
  {
    id: 'fire-and-forget',
    name: 'Fire and Forget',
    description: 'MarketPulse sends a signal to ResearchHub with no expectation of a response. Used for event notifications and telemetry.',
    agents: { from: 'MarketPulse', to: 'ResearchHub' },
    style: 'one-way',
  },
  {
    id: 'request-response',
    name: 'Request / Response',
    description: 'ContentForge sends a request to ResearchHub and waits synchronously for the response. Standard RPC pattern.',
    agents: { from: 'ContentForge', to: 'ResearchHub' },
    style: 'two-way',
  },
  {
    id: 'long-running-callback',
    name: 'Long-Running + Callback',
    description: 'ContentForge submits a long-running task to ResearchHub, which processes it asynchronously and calls back when done.',
    agents: { from: 'ContentForge', to: 'ResearchHub', returnLabel: 'callback' },
    style: 'callback',
  },
  {
    id: 'streaming',
    name: 'Streaming',
    description: 'ContentForge opens a streaming connection to ResearchHub, receiving partial results as they are generated via SSE.',
    agents: { from: 'ContentForge', to: 'ResearchHub' },
    style: 'streaming',
  },
  {
    id: 'polling',
    name: 'Polling',
    description: 'ContentForge submits a task and then repeatedly polls ResearchHub for status updates until the result is ready.',
    agents: { from: 'ContentForge', to: 'ResearchHub' },
    style: 'polling',
  },
];

const demoStates = reactive<Record<string, { running: boolean; complete: boolean; result: string; error: string }>>({});
for (const p of patterns) {
  demoStates[p.id] = { running: false, complete: false, result: '', error: '' };
}

const animatingDots = ref(true);
const { protocolApi } = useApi();
const authStore = useAuthStore();

async function runFireAndForget(): Promise<void> {
  const state = demoStates['fire-and-forget'];
  const resp = await protocolApi.post<{ status: string; message: string; dispatchedAt: string }>(
    '/api/async-patterns/fire-and-forget',
  );
  state.result = `202 Accepted — ${resp.message} Dispatched at ${resp.dispatchedAt}.`;
}

async function runRequestResponse(): Promise<void> {
  const state = demoStates['request-response'];
  const resp = await protocolApi.post<{
    topic: string;
    narrative: string | null;
    relatedArticles: unknown[];
    relatedCategories: unknown[];
    roundTripMs: number;
  }>('/api/async-patterns/request-response');
  state.result = `ResearchHub returned ${resp.relatedArticles.length} articles and ${resp.relatedCategories.length} categories in ${resp.roundTripMs}ms. Topic: "${resp.topic}".`;
}

async function runCallback(): Promise<void> {
  const state = demoStates['long-running-callback'];
  const callbackId = `cb-${Date.now()}`;

  const submit = await protocolApi.post<{ taskId: string; status: string; message: string }>(
    '/api/async-patterns/callback',
    { callbackId },
  );

  state.result = `Task accepted (id: ${submit.taskId}). Polling for callback result...`;

  // Poll until complete
  let attempts = 0;
  const maxAttempts = 20;
  while (attempts < maxAttempts) {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    attempts++;

    const status = await protocolApi.get<{ taskId: string; status: string; result?: unknown }>(
      `/api/async-patterns/callback/${submit.taskId}`,
    );

    if (status.status === 'complete') {
      const resultObj = status.result as Record<string, unknown> | null;
      const stepCount = resultObj && Array.isArray(resultObj['steps']) ? (resultObj['steps'] as unknown[]).length : 0;
      state.result = `Task ${submit.taskId} complete. ContentForge executed ${stepCount} pipeline steps. Callback delivered.`;
      return;
    }

    state.result = `Task ${submit.taskId} — poll ${attempts}/${maxAttempts}: pending...`;
  }

  state.result = `Task ${submit.taskId} — max polls reached. Check observability log for result.`;
}

async function runStreaming(): Promise<void> {
  const state = demoStates['streaming'];
  const authHeaders = authStore.getAuthHeaders();

  // EventSource does not support custom headers natively.
  // We use fetch with the auth token to consume the SSE stream manually.
  const chunks: string[] = [];
  let tokenCount = 0;

  const response = await fetch('/protocol-api/api/async-patterns/streaming', {
    headers: { ...authHeaders },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Streaming endpoint returned ${response.status}`);
  }

  state.result = 'Stream opened. Receiving chunks...';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json) continue;

      const event = JSON.parse(json) as { type: string; chunk?: string; tokenCount?: number; message?: string };

      if (event.type === 'data' && event.chunk) {
        chunks.push(event.chunk);
        state.result = `Received ${chunks.length} chunk(s): ${event.chunk.slice(0, 80)}...`;
      } else if (event.type === 'done') {
        tokenCount = event.tokenCount ?? 0;
      } else if (event.type === 'error') {
        throw new Error(event.message ?? 'Stream error');
      }
    }
  }

  state.result = `Stream complete. Received ${chunks.length} chunk(s), ~${tokenCount} tokens of research data.`;
}

async function runPolling(): Promise<void> {
  const state = demoStates['polling'];

  const submit = await protocolApi.post<{ taskId: string; status: string; message: string }>(
    '/api/async-patterns/polling',
  );

  state.result = `Task ${submit.taskId} submitted. Polling for completion...`;

  let attempts = 0;
  const maxAttempts = 20;
  const pollLog: string[] = [];

  while (attempts < maxAttempts) {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    attempts++;

    const status = await protocolApi.get<{ taskId: string; status: string; result?: unknown }>(
      `/api/async-patterns/polling/${submit.taskId}`,
    );

    pollLog.push(`Poll ${attempts}: ${status.status}`);
    state.result = pollLog.join(' → ');

    if (status.status === 'complete') {
      const resultObj = status.result as Record<string, unknown> | null;
      const title = resultObj && typeof resultObj['title'] === 'string' ? resultObj['title'] : 'draft complete';
      state.result = `${pollLog.join(' → ')} → Result: ${title}`;
      return;
    }
  }

  state.result = `${pollLog.join(' → ')} → Max polls reached.`;
}

async function runDemo(patternId: string): Promise<void> {
  const state = demoStates[patternId];
  state.running = true;
  state.complete = false;
  state.result = '';
  state.error = '';

  try {
    switch (patternId) {
      case 'fire-and-forget':
        await runFireAndForget();
        break;
      case 'request-response':
        await runRequestResponse();
        break;
      case 'long-running-callback':
        await runCallback();
        break;
      case 'streaming':
        await runStreaming();
        break;
      case 'polling':
        await runPolling();
        break;
      default:
        throw new Error(`Unknown pattern: ${patternId}`);
    }
    state.complete = true;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    state.complete = true;
  } finally {
    state.running = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Async Communication Patterns</h1>
      <p class="text-gray-400 mt-1">Five fundamental patterns for agent-to-agent asynchronous communication.</p>
    </div>

    <div class="grid gap-6">
      <div
        v-for="pattern in patterns"
        :key="pattern.id"
        class="card"
      >
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-lg font-semibold text-white">{{ pattern.name }}</h2>
            <p class="text-sm text-gray-400 mt-1 max-w-2xl">{{ pattern.description }}</p>
          </div>
          <button
            class="btn-primary text-sm flex-shrink-0"
            :disabled="demoStates[pattern.id].running"
            @click="runDemo(pattern.id)"
          >
            <span v-if="demoStates[pattern.id].running" class="flex items-center gap-2">
              <span class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running...
            </span>
            <span v-else>Run Demo</span>
          </button>
        </div>

        <!-- Flow Diagram -->
        <div class="bg-gray-950 rounded-lg p-6 mb-4">
          <svg viewBox="0 0 600 80" class="w-full h-20" xmlns="http://www.w3.org/2000/svg">
            <!-- From Agent Box -->
            <rect x="10" y="20" width="140" height="40" rx="8" class="fill-blue-900 stroke-blue-500" stroke-width="1.5" />
            <text x="80" y="45" text-anchor="middle" class="fill-blue-300 text-xs" font-size="13">{{ pattern.agents.from }}</text>

            <!-- To Agent Box -->
            <rect x="450" y="20" width="140" height="40" rx="8" class="fill-emerald-900 stroke-emerald-500" stroke-width="1.5" />
            <text x="520" y="45" text-anchor="middle" class="fill-emerald-300 text-xs" font-size="13">{{ pattern.agents.to }}</text>

            <!-- One-way arrow -->
            <template v-if="pattern.style === 'one-way'">
              <line x1="155" y1="40" x2="440" y2="40" class="stroke-gray-400" stroke-width="2" stroke-dasharray="8 4" />
              <polygon points="440,35 450,40 440,45" class="fill-gray-400" />
              <text x="298" y="32" text-anchor="middle" class="fill-gray-500" font-size="11">fire &amp; forget</text>
            </template>

            <!-- Two-way arrows -->
            <template v-if="pattern.style === 'two-way'">
              <line x1="155" y1="34" x2="440" y2="34" class="stroke-blue-400" stroke-width="2" />
              <polygon points="440,29 450,34 440,39" class="fill-blue-400" />
              <text x="298" y="28" text-anchor="middle" class="fill-blue-400" font-size="11">request</text>

              <line x1="440" y1="50" x2="155" y2="50" class="stroke-emerald-400" stroke-width="2" />
              <polygon points="160,45 150,50 160,55" class="fill-emerald-400" />
              <text x="298" y="64" text-anchor="middle" class="fill-emerald-400" font-size="11">response</text>
            </template>

            <!-- Callback pattern -->
            <template v-if="pattern.style === 'callback'">
              <line x1="155" y1="30" x2="440" y2="30" class="stroke-blue-400" stroke-width="2" />
              <polygon points="440,25 450,30 440,35" class="fill-blue-400" />
              <text x="298" y="24" text-anchor="middle" class="fill-blue-400" font-size="11">submit task</text>

              <!-- Clock icon (simple) -->
              <circle cx="520" cy="65" r="0" class="fill-none stroke-yellow-400" stroke-width="1.5">
                <animate v-if="demoStates[pattern.id].running" attributeName="r" values="0;6;0" dur="1.5s" repeatCount="indefinite" />
              </circle>

              <line x1="440" y1="52" x2="155" y2="52" class="stroke-yellow-400" stroke-width="2" stroke-dasharray="6 3" />
              <polygon points="160,47 150,52 160,57" class="fill-yellow-400" />
              <text x="298" y="66" text-anchor="middle" class="fill-yellow-400" font-size="11">callback (async)</text>
            </template>

            <!-- Streaming pattern -->
            <template v-if="pattern.style === 'streaming'">
              <line x1="155" y1="34" x2="440" y2="34" class="stroke-blue-400" stroke-width="2" />
              <polygon points="440,29 450,34 440,39" class="fill-blue-400" />
              <text x="298" y="28" text-anchor="middle" class="fill-blue-400" font-size="11">open stream</text>

              <!-- Streaming dots -->
              <circle cx="400" cy="52" r="3" class="fill-purple-400">
                <animate v-if="animatingDots" attributeName="cx" values="430;170" dur="2s" repeatCount="indefinite" />
                <animate v-if="animatingDots" attributeName="opacity" values="1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx="370" cy="52" r="3" class="fill-purple-400">
                <animate v-if="animatingDots" attributeName="cx" values="400;140" dur="2s" repeatCount="indefinite" begin="0.3s" />
                <animate v-if="animatingDots" attributeName="opacity" values="1;0.3" dur="2s" repeatCount="indefinite" begin="0.3s" />
              </circle>
              <circle cx="340" cy="52" r="3" class="fill-purple-400">
                <animate v-if="animatingDots" attributeName="cx" values="370;110" dur="2s" repeatCount="indefinite" begin="0.6s" />
                <animate v-if="animatingDots" attributeName="opacity" values="1;0.3" dur="2s" repeatCount="indefinite" begin="0.6s" />
              </circle>
              <text x="298" y="68" text-anchor="middle" class="fill-purple-400" font-size="11">SSE chunks</text>
            </template>

            <!-- Polling pattern -->
            <template v-if="pattern.style === 'polling'">
              <line x1="155" y1="30" x2="440" y2="30" class="stroke-blue-400" stroke-width="2" />
              <polygon points="440,25 450,30 440,35" class="fill-blue-400" />
              <text x="298" y="24" text-anchor="middle" class="fill-blue-400" font-size="11">submit</text>

              <!-- Poll loop -->
              <line x1="200" y1="52" x2="400" y2="52" class="stroke-cyan-400" stroke-width="1.5" stroke-dasharray="4 3" />
              <polygon points="400,48 408,52 400,56" class="fill-cyan-400" />
              <line x1="400" y1="58" x2="200" y2="58" class="stroke-cyan-400" stroke-width="1.5" stroke-dasharray="4 3" />
              <polygon points="204,54 196,58 204,62" class="fill-cyan-400" />
              <text x="298" y="72" text-anchor="middle" class="fill-cyan-400" font-size="11">poll / status</text>
            </template>
          </svg>
        </div>

        <!-- Result Area -->
        <div
          :class="[
            'rounded-lg px-4 py-3 text-sm min-h-[48px] flex items-center transition-all duration-300',
            demoStates[pattern.id].running ? 'bg-gray-950 border border-blue-800' :
            demoStates[pattern.id].error ? 'bg-gray-950 border border-red-800' :
            demoStates[pattern.id].complete ? 'bg-gray-950 border border-emerald-800' :
            'bg-gray-950 border border-gray-800',
          ]"
        >
          <template v-if="demoStates[pattern.id].running">
            <div class="flex items-center gap-3 text-blue-400">
              <span class="flex gap-1">
                <span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
                <span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 150ms" />
                <span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 300ms" />
              </span>
              Executing {{ pattern.name.toLowerCase() }} pattern...
            </div>
          </template>
          <template v-else-if="demoStates[pattern.id].error">
            <div class="flex items-start gap-2 text-red-400">
              <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>{{ demoStates[pattern.id].error }}</span>
            </div>
          </template>
          <template v-else-if="demoStates[pattern.id].complete">
            <div class="flex items-start gap-2 text-emerald-400">
              <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>{{ demoStates[pattern.id].result }}</span>
            </div>
          </template>
          <template v-else>
            <span class="text-gray-400">Click "Run Demo" to execute this pattern against real backend services.</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

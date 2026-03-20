<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';
import { useMiniMeStore } from '../../stores/mini-me.store';
import JsonPayloadViewer from '../../components/shared/JsonPayloadViewer.vue';

const store = useMiniMeStore();
const messageInput = ref('');
const selectedSkill = ref('');
const showRawJson = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const requestMode = ref(false);
const requestSubject = ref('');
const requestPriority = ref('normal');

const skillOptions = computed(() => [
  { id: '', label: 'Auto-route (let Mini-Me decide)' },
  ...store.skills.map((s) => ({ id: s.id, label: `${s.name} — ${s.description}` })),
]);

async function send() {
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = '';
  try {
    if (requestMode.value) {
      const subject = requestSubject.value.trim() || text.slice(0, 60);
      await store.sendWorkRequest(subject, text, requestPriority.value);
      requestSubject.value = '';
      requestMode.value = false;
    } else {
      await store.sendMessage(text, selectedSkill.value || undefined);
    }
  } catch {
    // error is already in store.error
  }

  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

function useSuggestion(text: string) {
  messageInput.value = text;
}

const suggestions = [
  'What categories do you track?',
  'Give me a contrarian briefing',
  'Search for articles about AI agents',
  'What are the latest scout signals?',
  "What's your daily digest?",
];
</script>

<template>
  <div class="space-y-4">
    <!-- Skill selector -->
    <div class="flex items-center gap-3">
      <select
        v-model="selectedSkill"
        class="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:border-protocol-primary focus:outline-none flex-1"
      >
        <option v-for="opt in skillOptions" :key="opt.id" :value="opt.id">
          {{ opt.label }}
        </option>
      </select>

      <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer whitespace-nowrap">
        <input
          v-model="showRawJson"
          type="checkbox"
          class="rounded bg-gray-700 border-gray-600 text-protocol-primary focus:ring-protocol-primary"
        />
        Raw JSON
      </label>
    </div>

    <!-- Request mode toggle -->
    <div class="flex items-center gap-3">
      <button
        :class="[
          'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          requestMode
            ? 'bg-amber-600 text-white'
            : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700',
        ]"
        @click="requestMode = !requestMode"
      >
        {{ requestMode ? 'Work Request Mode ON' : 'Send Work Request' }}
      </button>

      <template v-if="requestMode">
        <input
          v-model="requestSubject"
          placeholder="Request subject..."
          class="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:border-amber-500 focus:outline-none flex-1"
        />
        <select
          v-model="requestPriority"
          class="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </template>
    </div>

    <!-- Conversation -->
    <div
      ref="chatContainer"
      class="bg-gray-900 border border-gray-700 rounded-lg overflow-y-auto"
      style="height: calc(100vh - 420px); min-height: 300px"
    >
      <!-- Empty state with suggestions -->
      <div
        v-if="store.conversation.length === 0"
        class="flex flex-col items-center justify-center h-full text-center p-6"
      >
        <div class="w-16 h-16 rounded-full bg-purple-900/50 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <p class="text-gray-400 mb-4">Send a message to Mini-Me via A2A protocol</p>
        <div class="flex flex-wrap gap-2 justify-center max-w-lg">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            class="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-full text-xs text-gray-300 hover:border-protocol-primary hover:text-white transition-colors"
            @click="useSuggestion(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div v-else class="p-4 space-y-4">
        <div
          v-for="entry in store.conversation"
          :key="entry.id"
          :class="['flex', entry.role === 'user' ? 'justify-end' : 'justify-start']"
        >
          <div
            :class="[
              'max-w-[80%] rounded-lg px-4 py-3',
              entry.role === 'user'
                ? 'bg-protocol-primary/20 border border-protocol-primary/30'
                : 'bg-gray-800 border border-gray-700',
            ]"
          >
            <!-- Skill badge -->
            <div v-if="entry.skill" class="mb-2">
              <span
                :class="[
                  'inline-block px-2 py-0.5 rounded text-xs font-medium',
                  entry.role === 'user'
                    ? 'bg-protocol-primary/30 text-protocol-primary'
                    : 'bg-purple-900/50 text-purple-300',
                ]"
              >
                {{ entry.skill }}
              </span>
            </div>

            <!-- Message text -->
            <p class="text-sm text-gray-200 whitespace-pre-wrap">{{ entry.text }}</p>

            <!-- Artifacts -->
            <div v-if="entry.artifacts?.length" class="mt-3 space-y-2">
              <div
                v-for="(artifact, idx) in entry.artifacts"
                :key="idx"
              >
                <div
                  v-for="(part, pidx) in artifact.parts"
                  :key="pidx"
                >
                  <div v-if="part.type === 'data' && part.data" class="mt-1">
                    <JsonPayloadViewer
                      :data="part.data"
                      :label="`${artifact.name}`"
                    />
                  </div>
                  <p
                    v-else-if="part.type === 'text' && part.text"
                    class="text-xs text-gray-400 mt-1 italic"
                  >
                    {{ part.text }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Raw JSON toggle -->
            <div v-if="showRawJson && (entry.rawRequest || entry.rawResponse)" class="mt-3">
              <JsonPayloadViewer
                v-if="entry.rawRequest"
                :data="entry.rawRequest"
                label="Request JSON"
              />
              <JsonPayloadViewer
                v-if="entry.rawResponse"
                :data="entry.rawResponse"
                label="Response JSON"
                class="mt-2"
              />
            </div>

            <!-- Timestamp -->
            <p class="text-[10px] text-gray-500 mt-2">
              {{ new Date(entry.timestamp).toLocaleTimeString() }}
            </p>
          </div>
        </div>

        <!-- Sending indicator -->
        <div v-if="store.sending" class="flex justify-start">
          <div class="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="flex gap-1">
                <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0ms" />
                <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 150ms" />
                <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 300ms" />
              </div>
              <span class="text-xs text-gray-500">Mini-Me is thinking...</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-2">
      <p class="text-red-300 text-sm">{{ store.error }}</p>
    </div>

    <!-- Input -->
    <div class="flex gap-2">
      <input
        v-model="messageInput"
        :placeholder="requestMode ? 'Describe the work request...' : 'Send a message to Mini-Me...'"
        class="flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-4 py-3 focus:border-protocol-primary focus:outline-none"
        @keydown.enter.prevent="send"
        :disabled="store.sending"
      />
      <button
        :class="[
          'px-6 py-3 rounded-lg text-sm font-medium transition-colors',
          store.sending
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : requestMode
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'bg-protocol-primary hover:bg-protocol-primary/80 text-white',
        ]"
        :disabled="store.sending || !messageInput.trim()"
        @click="send"
      >
        {{ requestMode ? 'Send Request' : 'Send' }}
      </button>
      <button
        v-if="store.conversation.length > 0"
        class="px-3 py-3 rounded-lg text-sm text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors"
        title="Clear conversation"
        @click="store.clearConversation()"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  </div>
</template>

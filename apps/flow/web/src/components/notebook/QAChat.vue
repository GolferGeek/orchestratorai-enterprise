<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
      <button
        class="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        @click="$emit('back')"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div>
        <h2 class="font-semibold">AI Q&A</h2>
        <p class="text-xs text-gray-500">{{ collection.name }}</p>
      </div>
    </div>

    <!-- Messages -->
    <div class="flex-1 overflow-auto p-4 space-y-4">
      <div v-if="messages.length === 0" class="text-center py-12 text-gray-500">
        <p class="text-lg mb-2">Ask a question about your documents</p>
        <p class="text-sm">The AI will search through your collection and provide answers with source citations.</p>
      </div>

      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
      >
        <div
          :class="[
            'max-w-[80%] rounded-lg px-4 py-3',
            msg.role === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
          ]"
        >
          <p class="text-sm whitespace-pre-wrap">{{ msg.content }}</p>

          <!-- Citations -->
          <div
            v-if="msg.citations && msg.citations.length > 0"
            class="mt-3 pt-3 border-t border-gray-200/50 space-y-2"
          >
            <p class="text-xs font-medium opacity-70">Sources:</p>
            <div
              v-for="(cite, cIdx) in msg.citations"
              :key="cIdx"
              class="flex items-start gap-2 text-xs opacity-80"
            >
              <svg class="w-3 h-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <span class="font-medium">{{ cite.documentFilename }}</span>
                <span v-if="cite.pageNumber" class="ml-1">(p.{{ cite.pageNumber }})</span>
                <p class="line-clamp-2 opacity-60 mt-0.5">{{ cite.content.substring(0, 150) }}...</p>
              </div>
            </div>
          </div>

          <!-- Metadata -->
          <p v-if="msg.durationMs" class="text-[10px] opacity-50 mt-2">
            {{ msg.model }} &middot; {{ (msg.durationMs / 1000).toFixed(1) }}s
          </p>
        </div>
      </div>

      <!-- Loading indicator -->
      <div v-if="loading" class="flex justify-start">
        <div class="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 flex items-center gap-2">
          <svg class="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span class="text-sm text-gray-500">Searching and analyzing...</span>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded text-sm">
        {{ error }}
      </div>

      <div ref="messagesEndRef" />
    </div>

    <!-- Input -->
    <div class="p-4 border-t border-gray-200 dark:border-gray-700">
      <div class="flex gap-2">
        <textarea
          v-model="input"
          class="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm resize-none min-h-[40px] max-h-[120px] outline-none focus:border-blue-500 bg-white dark:bg-gray-800 disabled:opacity-50"
          placeholder="Ask a question about your documents..."
          rows="1"
          :disabled="loading"
          @keydown="handleKeyDown"
        />
        <button
          class="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          :disabled="!input.trim() || loading"
          @click="handleSubmit"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { askQuestion } from '@/services/notebook-api.service';
import type { QAResponse } from '@/services/notebook-api.service';

interface Props {
  collection: { id: string; name: string };
}

defineProps<Props>();

defineEmits<{
  back: [];
}>();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: QAResponse['citations'];
  model?: string;
  durationMs?: number;
}

const messages = ref<ChatMessage[]>([]);
const input = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const messagesEndRef = ref<HTMLElement | null>(null);

// Props are available via defineProps return but we need collection.id in handleSubmit
// Use a ref to capture it from the parent call
const props = defineProps<Props>();

async function scrollToBottom() {
  await nextTick();
  messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' });
}

async function handleSubmit() {
  const question = input.value.trim();
  if (!question || loading.value) return;

  input.value = '';
  error.value = null;

  messages.value.push({ role: 'user', content: question });
  await scrollToBottom();

  loading.value = true;
  try {
    const response = await askQuestion(props.collection.id, question);
    messages.value.push({
      role: 'assistant',
      content: response.answer,
      citations: response.citations,
      model: response.model,
      durationMs: response.totalDurationMs,
    });
    await scrollToBottom();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to get answer';
  } finally {
    loading.value = false;
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
}
</script>

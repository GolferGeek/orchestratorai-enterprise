<template>
  <div class="agent-response">
    <div class="agent-avatar">
      <ion-icon :icon="sparklesOutline" class="agent-icon" />
    </div>
    <div class="response-body">
      <!-- Image output -->
      <div v-if="outputType === 'image'" class="response-media">
        <img :src="content" alt="Generated image" class="generated-image" @click="openImage" />
      </div>

      <!-- Video output -->
      <div v-else-if="outputType === 'video'" class="response-media">
        <video :src="content" controls class="generated-video" />
      </div>

      <!-- Text / Markdown / JSON output -->
      <div v-else class="response-content" v-html="renderedContent" />

      <!-- RAG Sources (shown when agent returned source citations) -->
      <RagSourcesPanel
        v-if="ragSources.length > 0"
        :sources="ragSources"
        :organization-slug="ragOrgSlug"
      />

      <div class="response-footer">
        <span v-if="metadata?.provider" class="provider-badge">
          {{ metadata.provider }} / {{ metadata.model }}
        </span>
        <span v-if="metadata?.runnerChain?.length" class="runner-chain">
          via {{ metadata.runnerChain.join(' → ') }}
        </span>
        <span class="message-timestamp">{{ formatTime(timestamp) }}</span>
      </div>

      <!-- Evaluation row -->
      <div v-if="messageId" class="evaluation-row">
        <button
          class="eval-btn"
          :class="{ 'eval-btn--active': currentRating === 'up' }"
          :aria-label="currentRating === 'up' ? 'Rated helpful' : 'Rate as helpful'"
          @click="handleThumbsUp"
        >
          <ion-icon :icon="currentRating === 'up' ? thumbsUp : thumbsUpOutline" />
        </button>
        <button
          class="eval-btn"
          :class="{ 'eval-btn--active eval-btn--down': currentRating === 'down' }"
          :aria-label="currentRating === 'down' ? 'Rated not helpful' : 'Rate as not helpful'"
          @click="handleThumbsDown"
        >
          <ion-icon :icon="currentRating === 'down' ? thumbsDown : thumbsDownOutline" />
        </button>
        <transition name="feedback-slide">
          <div v-if="showFeedbackInput" class="feedback-input-row">
            <input
              ref="feedbackInputRef"
              v-model="feedbackText"
              class="feedback-input"
              type="text"
              placeholder="Optional note..."
              maxlength="200"
              @keydown.enter="submitFeedback"
              @keydown.escape="cancelFeedback"
            />
            <button class="feedback-submit" @click="submitFeedback">Done</button>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, nextTick } from 'vue';
import { IonIcon } from '@ionic/vue';
import {
  sparklesOutline,
  thumbsUpOutline,
  thumbsUp,
  thumbsDownOutline,
  thumbsDown,
} from 'ionicons/icons';
import type { ConversationMessage, MessageEvaluation } from '@/stores/conversation.store';
import { useConversationStore } from '@/stores/conversation.store';
import RagSourcesPanel from '@/components/rag/RagSourcesPanel.vue';
import { extractRagSources } from '@/services/ragService';

const props = defineProps<{
  content: string;
  outputType?: string;
  timestamp: string;
  metadata?: ConversationMessage['metadata'];
  messageId?: string;
  evaluation?: MessageEvaluation;
}>();

const conversationStore = useConversationStore();

// Local UI state
const showFeedbackInput = ref(false);
const feedbackText = ref('');
const feedbackInputRef = ref<HTMLInputElement | null>(null);

const currentRating = computed(() => props.evaluation?.rating ?? null);

const ragSources = computed(() => {
  if (!props.metadata) return [];
  return extractRagSources(props.metadata as Record<string, unknown>);
});

const ragOrgSlug = computed(() => {
  const meta = props.metadata as Record<string, unknown> | undefined;
  // Try explicit orgSlug first, then extract from the agent's org context
  return (meta?.orgSlug as string) ||
    (meta?.organizationSlug as string) ||
    'legal'; // default for legal RAG agents
});

function handleThumbsUp(): void {
  if (!props.messageId) return;
  // Toggle off if already rated up
  const newRating = currentRating.value === 'up' ? null : 'up';
  conversationStore.setMessageEvaluation(props.messageId, newRating, undefined);
  showFeedbackInput.value = false;
  feedbackText.value = '';
}

function handleThumbsDown(): void {
  if (!props.messageId) return;
  if (currentRating.value === 'down') {
    // Toggle off
    conversationStore.setMessageEvaluation(props.messageId, null, undefined);
    showFeedbackInput.value = false;
    feedbackText.value = '';
    return;
  }
  conversationStore.setMessageEvaluation(props.messageId, 'down', undefined);
  showFeedbackInput.value = true;
  nextTick(() => {
    feedbackInputRef.value?.focus();
  });
}

function submitFeedback(): void {
  if (!props.messageId) return;
  conversationStore.setMessageEvaluation(props.messageId, 'down', feedbackText.value || undefined);
  showFeedbackInput.value = false;
}

function cancelFeedback(): void {
  showFeedbackInput.value = false;
  feedbackText.value = '';
}

function openImage(): void {
  window.open(props.content, '_blank');
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked for safe rendering with GFM (tables, strikethrough, etc.)
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Renders full Markdown via `marked`, then sanitizes with DOMPurify to prevent XSS.
 * DOMPurify strips any script tags, event handlers, and unsafe attributes injected
 * by malicious content before the HTML reaches the DOM.
 */
const renderedContent = computed(() => {
  const raw = marked.parse(props.content) as string;
  return DOMPurify.sanitize(raw);
});
</script>

<style scoped>
.agent-response {
  display: flex;
  gap: 10px;
  max-width: 80%;
  align-items: flex-start;
}

.agent-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ion-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-icon {
  color: var(--ion-color-secondary-contrast);
  font-size: 16px;
}

.response-body {
  background: var(--ion-color-step-50);
  border: 1px solid var(--ion-color-step-150);
  border-radius: 4px 18px 18px 18px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.response-content {
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--ion-text-color);
  word-break: break-word;
}

/* Markdown rendered content */
.response-content :deep(h1),
.response-content :deep(h2),
.response-content :deep(h3) {
  margin: 0.5em 0 0.25em;
  font-weight: 600;
}

.response-content :deep(h1) { font-size: 1.2rem; }
.response-content :deep(h2) { font-size: 1.1rem; }
.response-content :deep(h3) { font-size: 1rem; }

.response-content :deep(p) {
  margin: 0.4em 0;
}

.response-content :deep(ul),
.response-content :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.5em;
}

.response-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
  font-size: 0.85rem;
}

.response-content :deep(th),
.response-content :deep(td) {
  border: 1px solid var(--ion-color-step-200);
  padding: 6px 10px;
  text-align: left;
}

.response-content :deep(th) {
  background: var(--ion-color-step-100);
  font-weight: 600;
}

.response-content :deep(tr:nth-child(even)) {
  background: var(--ion-color-step-50);
}

.response-content :deep(code) {
  background: var(--ion-color-step-100);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.85em;
}

.response-content :deep(pre) {
  background: var(--ion-color-step-100);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5em 0;
}

.response-content :deep(pre code) {
  background: none;
  padding: 0;
}

.response-content :deep(blockquote) {
  border-left: 3px solid var(--ion-color-primary);
  margin: 0.5em 0;
  padding: 0.25em 0.75em;
  color: var(--ion-color-medium);
}

.response-footer {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.provider-badge,
.runner-chain {
  font-size: 0.72rem;
  color: var(--ion-color-medium);
  background: var(--ion-color-step-100);
  padding: 1px 6px;
  border-radius: 4px;
}

.message-timestamp {
  font-size: 0.72rem;
  color: var(--ion-color-medium);
  margin-left: auto;
}

.response-media {
  max-width: 100%;
}

.generated-image {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.generated-image:hover {
  opacity: 0.9;
}

.generated-video {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
}

/* Evaluation row */
.evaluation-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  flex-wrap: wrap;
}

.eval-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  color: var(--ion-color-medium);
  font-size: 15px;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}

.eval-btn:hover {
  color: var(--ion-color-dark);
  background: var(--ion-color-step-100);
}

.eval-btn--active {
  color: var(--ion-color-success);
}

.eval-btn--active.eval-btn--down {
  color: var(--ion-color-danger);
}

/* Feedback input */
.feedback-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.feedback-input {
  flex: 1;
  min-width: 0;
  font-size: 0.78rem;
  padding: 2px 8px;
  border: 1px solid var(--ion-color-step-300);
  border-radius: 10px;
  background: var(--ion-background-color);
  color: var(--ion-text-color);
  outline: none;
  height: 24px;
}

.feedback-input:focus {
  border-color: var(--ion-color-primary);
}

.feedback-submit {
  font-size: 0.72rem;
  padding: 2px 8px;
  border: none;
  border-radius: 10px;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  cursor: pointer;
  height: 24px;
  white-space: nowrap;
}

.feedback-submit:hover {
  opacity: 0.85;
}

/* Slide transition for feedback input */
.feedback-slide-enter-active,
.feedback-slide-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.feedback-slide-enter-from,
.feedback-slide-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}
</style>

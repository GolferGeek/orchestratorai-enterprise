<template>
  <button
    class="voice-btn"
    :class="stateClass"
    :aria-label="ariaLabel"
    :disabled="isDisabled"
    @click="handleClick"
  >
    <ion-icon :icon="stateIcon" />
  </button>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import {
  micOutline,
  mic,
  volumeHighOutline,
  hourglass,
} from 'ionicons/icons';
import { useVoiceChat } from '@/composables/useVoiceChat';

// ============================================================================
// Emits
// ============================================================================

const emit = defineEmits<{
  send: [message: string];
}>();

// ============================================================================
// Composable
// ============================================================================

const { voiceState, startListening, stopListening, cancelSpeaking, error } = useVoiceChat();

// ============================================================================
// Computed state mapping
// ============================================================================

const stateClass = computed(() => ({
  'voice-btn--listening': voiceState.value === 'listening',
  'voice-btn--transcribing': voiceState.value === 'transcribing',
  'voice-btn--speaking': voiceState.value === 'speaking',
}));

const stateIcon = computed(() => {
  switch (voiceState.value) {
    case 'listening':
      return mic;
    case 'transcribing':
    case 'processing':
      return hourglass;
    case 'speaking':
      return volumeHighOutline;
    default:
      return micOutline;
  }
});

const ariaLabel = computed(() => {
  switch (voiceState.value) {
    case 'listening':
      return 'Stop recording';
    case 'transcribing':
      return 'Transcribing...';
    case 'processing':
      return 'Processing...';
    case 'speaking':
      return 'Stop speaking';
    default:
      return 'Start voice input';
  }
});

// Disable during transcribing/processing — those are non-interactive transitions
const isDisabled = computed(() =>
  voiceState.value === 'transcribing' || voiceState.value === 'processing'
);

// ============================================================================
// Click handler
// ============================================================================

async function handleClick(): Promise<void> {
  error.value = null;

  if (voiceState.value === 'idle') {
    await startListening();
    return;
  }

  if (voiceState.value === 'listening') {
    const text = await stopListening();
    if (text) {
      emit('send', text);
    }
    return;
  }

  if (voiceState.value === 'speaking') {
    cancelSpeaking();
    return;
  }
}
</script>

<style scoped>
.voice-btn {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--ion-color-step-300);
  background: transparent;
  color: var(--ion-color-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
  margin-bottom: 2px;
}

.voice-btn:not(:disabled):hover {
  color: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
}

.voice-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Listening state — red mic with pulse */
.voice-btn--listening {
  background: var(--ion-color-danger);
  border-color: var(--ion-color-danger);
  color: var(--ion-color-danger-contrast);
  animation: voice-pulse 1.5s ease-in-out infinite;
}

.voice-btn--listening:not(:disabled):hover {
  background: var(--ion-color-danger-shade);
  border-color: var(--ion-color-danger-shade);
  color: var(--ion-color-danger-contrast);
}

/* Speaking state — primary color with pulse */
.voice-btn--speaking {
  background: var(--ion-color-primary);
  border-color: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  animation: voice-pulse-primary 1.5s ease-in-out infinite;
}

.voice-btn--speaking:not(:disabled):hover {
  background: var(--ion-color-primary-shade);
  border-color: var(--ion-color-primary-shade);
  color: var(--ion-color-primary-contrast);
}

/* Transcribing state — muted spinner-like look */
.voice-btn--transcribing {
  color: var(--ion-color-medium);
  border-color: var(--ion-color-medium);
}

@keyframes voice-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--ion-color-danger-rgb), 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(var(--ion-color-danger-rgb), 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(var(--ion-color-danger-rgb), 0);
  }
}

@keyframes voice-pulse-primary {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--ion-color-primary-rgb), 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(var(--ion-color-primary-rgb), 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(var(--ion-color-primary-rgb), 0);
  }
}
</style>

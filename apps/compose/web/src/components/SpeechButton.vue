<template>
  <ion-button
    fill="clear"
    :color="getButtonColor()"
    @click="toggleSpeech"
    :disabled="disabled || !currentAgent"
    class="speech-button"
    :title="getButtonTooltip()"
  >
    <div class="speech-container">
      <ion-icon
        slot="icon-only"
        :icon="micOutline"
        :class="getIconClasses()"
      ></ion-icon>

      <!-- Ripple animations -->
      <div
        v-if="isListening || isProcessing || isSpeaking"
        class="ripple-animation"
        :class="getRippleClasses()"
      >
        <div class="ripple"></div>
        <div class="ripple"></div>
        <div class="ripple"></div>
      </div>
    </div>
  </ion-button>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { IonButton, IonIcon, toastController } from "@ionic/vue";
import { micOutline } from "ionicons/icons";
import { useChatUiStore } from "@/stores/ui/chatUiStore";
import {
  sendMessage as sendMessageAction,
  createPlan,
  createDeliverable,
} from "@/services/invoke-actions";

// Define speech states
type SpeechState = "idle" | "listening" | "processing" | "speaking" | "error";

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "speechStart"): void;
  (e: "speechEnd"): void;
  (e: "error", error: string): void;
  (e: "transcription", text: string): void;
}>();

// Stores
const chatUiStore = useChatUiStore();

// State
const speechState = ref<SpeechState>("idle");

// Web Speech API setup
const SpeechRecognitionAPI =
  window.SpeechRecognition ||
  (
    window as unknown as {
      webkitSpeechRecognition?: typeof window.SpeechRecognition;
    }
  ).webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;

// Computed
const currentAgent = computed(() => chatUiStore.activeConversation?.agent);

const isListening = computed(() => speechState.value === "listening");
const isProcessing = computed(() => speechState.value === "processing");
const isSpeaking = computed(() => speechState.value === "speaking");

// Button appearance
const getButtonColor = () => {
  switch (speechState.value) {
    case "listening":
      return "success";
    case "processing":
      return "warning";
    case "speaking":
      return "tertiary";
    case "error":
      return "danger";
    default:
      return "medium";
  }
};

const getButtonTooltip = () => {
  switch (speechState.value) {
    case "listening":
      return "Listening... Click to stop";
    case "processing":
      return "Processing your speech...";
    case "speaking":
      return "Playing response...";
    case "error":
      return "Error occurred. Click to try again";
    default:
      return "Click to start voice conversation";
  }
};

const getIconClasses = () => {
  return {
    "icon-pulse": isListening.value,
    "icon-spin": isProcessing.value,
    "icon-glow": isSpeaking.value,
  };
};

const getRippleClasses = () => {
  return {
    "ripple-listening": isListening.value,
    "ripple-processing": isProcessing.value,
    "ripple-speaking": isSpeaking.value,
  };
};

// Main toggle function
const toggleSpeech = async () => {
  if (!currentAgent.value) {
    showError("No agent selected");
    return;
  }

  switch (speechState.value) {
    case "idle":
      await startListening();
      break;
    case "listening":
      stopListening();
      break;
    case "error":
      speechState.value = "idle";
      break;
    default:
      break;
  }
};

// Speech recognition using Web Speech API
const startListening = async () => {
  if (!SpeechRecognitionAPI) {
    showError("Speech recognition is not supported in this browser");
    return;
  }

  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    speechState.value = "listening";
    emit("speechStart");
  };

  recognition.onresult = async (event: SpeechRecognitionEvent) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript.trim()) {
      speechState.value = "processing";
      await processTranscription(finalTranscript.trim());
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "no-speech") {
      speechState.value = "idle";
      return;
    }

    let userMessage = "Voice input error.";
    if (event.error === "not-allowed") {
      userMessage =
        "Microphone access denied. Please enable microphone permissions.";
    } else if (event.error === "network") {
      userMessage = "Network error during voice input.";
    } else {
      userMessage = `Voice input failed: ${event.error}`;
    }
    showError(userMessage);
  };

  recognition.onend = () => {
    if (speechState.value === "listening") {
      speechState.value = "idle";
      emit("speechEnd");
    }
  };

  recognition.start();
};

const stopListening = () => {
  if (recognition) {
    recognition.stop();
  }
  speechState.value = "idle";
  emit("speechEnd");
};

// Process the transcribed text
const processTranscription = async (text: string) => {
  // Mark that the next message was sent via speech (for TTS triggering)
  chatUiStore.lastMessageWasSpeech = true;

  // Send the transcribed text through normal chat flow
  const conversation = chatUiStore.activeConversation;
  if (conversation) {
    const mode = chatUiStore.chatMode || "conversational";

    if (mode === "plan") {
      await createPlan(text);
    } else if (mode === "build") {
      await createDeliverable(text);
    } else {
      await sendMessageAction(text);
    }
  }

  emit("transcription", text);
  speechState.value = "idle";
  emit("speechEnd");
};

// Utility functions
const showError = async (message: string) => {
  speechState.value = "error";
  const toast = await toastController.create({
    message,
    duration: 3000,
    color: "danger",
    position: "top",
  });
  toast.present();
  emit("error", message);
};

// Cleanup
onUnmounted(() => {
  if (recognition) {
    recognition.abort();
    recognition = null;
  }
});
</script>

<style scoped>
.speech-button {
  position: relative;
  --padding-start: 8px;
  --padding-end: 8px;
}

.speech-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ripple-animation {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  pointer-events: none;
}

.ripple {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  opacity: 0.6;
}

.ripple-listening .ripple {
  background-color: var(--ion-color-success);
  animation: ripple-pulse 1.5s infinite ease-out;
}

.ripple-processing .ripple {
  background-color: var(--ion-color-warning);
  animation: ripple-spin 1s infinite linear;
}

.ripple-speaking .ripple {
  background-color: var(--ion-color-tertiary);
  animation: ripple-glow 2s infinite ease-in-out;
}

.ripple:nth-child(1) {
  animation-delay: 0s;
}
.ripple:nth-child(2) {
  animation-delay: 0.5s;
}
.ripple:nth-child(3) {
  animation-delay: 1s;
}

.icon-pulse {
  animation: icon-pulse 1.5s infinite ease-in-out;
}

.icon-spin {
  animation: icon-spin 1s infinite linear;
}

.icon-glow {
  animation: icon-glow 2s infinite ease-in-out;
}

@keyframes ripple-pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.3;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

@keyframes ripple-spin {
  0% {
    transform: rotate(0deg) scale(0.8);
    opacity: 0.4;
  }
  100% {
    transform: rotate(360deg) scale(1.2);
    opacity: 0.1;
  }
}

@keyframes ripple-glow {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

@keyframes icon-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

@keyframes icon-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes icon-glow {
  0%,
  100% {
    opacity: 1;
    filter: brightness(1);
  }
  50% {
    opacity: 0.8;
    filter: brightness(1.3);
  }
}
</style>

<template>
  <ion-button
    fill="clear"
    :color="getButtonColor()"
    @click="toggleConversation"
    :disabled="disabled"
    class="conversation-button custom-button-padding"
    :title="getButtonTooltip()"
  >
    <div class="ripple-container">
      <ion-icon
        slot="icon-only"
        :icon="radioButtonOnOutline"
        :class="getIconClasses()"
      ></ion-icon>

      <!-- Ripple animations -->
      <div
        v-if="isListening || isProcessing || isSpeaking"
        class="ripple-animation"
        :class="getRippleClasses()"
        :style="getRippleStyles()"
      >
        <div class="ripple"></div>
        <div class="ripple"></div>
        <div class="ripple"></div>
      </div>
    </div>
  </ion-button>
</template>

<script setup lang="ts">
import { ref, computed, defineEmits, onUnmounted, onMounted } from "vue";
import { IonButton, IonIcon, toastController } from "@ionic/vue";
import { radioButtonOnOutline } from "ionicons/icons";
import { useChatUiStore } from "@/stores/ui/chatUiStore";
import {
  sendMessage as sendMessageAction,
  createPlan,
  createDeliverable,
} from "@/services/invoke-actions";

// Define conversation states
type ConversationState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error"
  | "done";

const _props = defineProps<{
  conversationId: string;
  disabled?: boolean;
  agentName?: string;
  agentType?: string;
}>();

const emit = defineEmits<{
  (e: "conversationStart"): void;
  (e: "conversationEnd"): void;
  (e: "error", error: string): void;
}>();

const chatUiStore = useChatUiStore();

// Component state
const conversationState = ref<ConversationState>("idle");

// Web Speech API setup
const SpeechRecognitionAPI =
  window.SpeechRecognition ||
  (
    window as unknown as {
      webkitSpeechRecognition?: typeof window.SpeechRecognition;
    }
  ).webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;

// Computed properties
const isListening = computed(() => conversationState.value === "listening");
const isProcessing = computed(() => conversationState.value === "processing");
const isSpeaking = computed(() => conversationState.value === "speaking");

const getButtonColor = (): string => {
  switch (conversationState.value) {
    case "listening":
      return "primary";
    case "processing":
      return "secondary";
    case "speaking":
      return "tertiary";
    case "done":
      return "medium";
    case "error":
      return "dark";
    default:
      return "primary";
  }
};

const getIconClasses = (): string => {
  const classes = ["conversation-icon"];

  switch (conversationState.value) {
    case "listening":
      classes.push("listening");
      break;
    case "processing":
      classes.push("processing");
      break;
    case "speaking":
      classes.push("speaking");
      break;
    case "done":
      classes.push("done");
      break;
  }

  return classes.join(" ");
};

const getRippleClasses = (): string => {
  switch (conversationState.value) {
    case "listening":
      return "listening-ripples";
    case "processing":
      return "processing-ripples";
    case "speaking":
      return "speaking-ripples";
    default:
      return "";
  }
};

const getRippleStyles = () => {
  if (conversationState.value === "listening") {
    return {
      "--ripple-duration": "2.5s",
      "--ripple-scale": "1",
    };
  }
  return {};
};

const getButtonTooltip = (): string => {
  switch (conversationState.value) {
    case "listening":
      return "Click to stop listening";
    case "processing":
      return "Processing your speech...";
    case "speaking":
      return "Click to stop";
    case "done":
      return "Conversation ended - click to start new one";
    case "error":
      return "Error occurred - click to retry";
    default:
      return "Start voice conversation";
  }
};

// Main conversation control
const toggleConversation = async () => {
  if (conversationState.value === "idle") {
    await startConversation();
  } else if (conversationState.value === "listening") {
    stopListening();
  } else if (
    conversationState.value === "error" ||
    conversationState.value === "done"
  ) {
    resetConversation();
  }
};

const startConversation = async () => {
  if (!SpeechRecognitionAPI) {
    await presentToast("Speech recognition is not supported in this browser");
    emit("error", "Speech recognition not supported");
    return;
  }

  conversationState.value = "listening";
  emit("conversationStart");

  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = async (event: SpeechRecognitionEvent) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript.trim()) {
      conversationState.value = "processing";
      await processTranscription(finalTranscript.trim());
    }
  };

  recognition.onerror = async (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "no-speech") {
      // No speech detected - just reset silently
      conversationState.value = "idle";
      return;
    }

    conversationState.value = "error";

    let errorMessage = "Voice input error.";
    if (event.error === "not-allowed") {
      errorMessage =
        "Microphone access denied. Please enable microphone permissions.";
    } else if (event.error === "network") {
      errorMessage = "Network error during voice input.";
    } else {
      errorMessage = `Voice input failed: ${event.error}`;
    }

    await presentToast(errorMessage);
    emit("error", errorMessage);
    setTimeout(() => resetConversation(), 3000);
  };

  recognition.onend = () => {
    // If we're still in listening state when recognition ends, just reset
    if (conversationState.value === "listening") {
      conversationState.value = "idle";
      emit("conversationEnd");
    }
  };

  recognition.start();
};

const stopListening = () => {
  if (recognition) {
    recognition.stop();
  }
  conversationState.value = "idle";
  emit("conversationEnd");
};

// Process the transcribed text through normal chat flow
const processTranscription = async (text: string) => {
  // Mark that the next message was sent via speech (for TTS triggering)
  chatUiStore.lastMessageWasSpeech = true;

  // Send the transcribed text through normal chat flow
  const conversation = chatUiStore.activeConversation;
  if (conversation) {
    const mode = chatUiStore.chatMode || "converse";

    if (mode === "plan") {
      await createPlan(text);
    } else if (mode === "build") {
      await createDeliverable(text);
    } else {
      await sendMessageAction(text);
    }
  }

  // Response will be automatically converted to speech by useSpeechTTS composable
  // since we set lastMessageWasSpeech = true above
  conversationState.value = "idle";
  emit("conversationEnd");
};

const resetConversation = () => {
  if (recognition) {
    recognition.abort();
    recognition = null;
  }
  conversationState.value = "idle";
  emit("conversationEnd");
};

// Utility functions
const presentToast = async (
  message: string,
  duration: number = 3000,
  color: string = "danger",
) => {
  const toast = await toastController.create({
    message: message,
    duration: duration,
    position: "bottom",
    color: color,
  });
  await toast.present();
};

// Cleanup on unmount
onUnmounted(() => {
  if (recognition) {
    recognition.abort();
    recognition = null;
  }
});

// Cleanup on page unload/visibility change
onMounted(() => {
  const handleBeforeUnload = () => {
    if (recognition) {
      recognition.abort();
      recognition = null;
    }
  };

  const handleVisibilityChange = () => {
    if (document.hidden && recognition) {
      recognition.abort();
      recognition = null;
      conversationState.value = "idle";
    }
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  onUnmounted(() => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
});
</script>

<style scoped>
.conversation-button {
  --padding-start: 8px;
  --padding-end: 8px;
  height: 40px;
  position: relative;
}

.ripple-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.conversation-icon {
  transition: all 0.3s ease;
  z-index: 2;
  position: relative;
}

.conversation-icon.listening {
  color: var(--ion-color-primary);
}

.conversation-icon.processing {
  color: var(--ion-color-secondary);
  animation: pulse 1.5s ease-in-out infinite;
}

.conversation-icon.speaking {
  color: var(--ion-color-tertiary);
}

.conversation-icon.done {
  color: var(--ion-color-medium);
}

.ripple-animation {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
}

.ripple {
  position: absolute;
  border: 2px solid;
  border-radius: 50%;
  pointer-events: none;
}

/* Listening ripples - gentle pulse */
.listening-ripples .ripple {
  border-color: var(--ion-color-primary);
  opacity: 0.6;
  animation: listening-pulse var(--ripple-duration, 2.5s) infinite ease-out;
  transform: scale(var(--ripple-scale, 1));
}

.listening-ripples .ripple:nth-child(1) {
  animation-delay: 0s;
}

.listening-ripples .ripple:nth-child(2) {
  animation-delay: 0.8s;
  opacity: 0.4;
}

.listening-ripples .ripple:nth-child(3) {
  animation-delay: 1.6s;
  opacity: 0.3;
}

/* Processing ripples - subtle pulsing */
.processing-ripples .ripple {
  border-color: var(--ion-color-secondary);
  opacity: 0.5;
  animation: processing-pulse 2s infinite ease-in-out;
}

.processing-ripples .ripple:nth-child(1) {
  animation-delay: 0s;
}

.processing-ripples .ripple:nth-child(2) {
  animation-delay: 0.7s;
  opacity: 0.3;
}

.processing-ripples .ripple:nth-child(3) {
  animation-delay: 1.4s;
  opacity: 0.2;
}

/* Speaking ripples - gentle waves */
.speaking-ripples .ripple {
  border-color: var(--ion-color-tertiary);
  opacity: 0.5;
  animation: speaking-wave 3.5s infinite ease-in-out;
}

.speaking-ripples .ripple:nth-child(1) {
  animation-delay: 0s;
}

.speaking-ripples .ripple:nth-child(2) {
  animation-delay: 1s;
}

.speaking-ripples .ripple:nth-child(3) {
  animation-delay: 2s;
}

/* Animations - gentle and subtle */
@keyframes listening-pulse {
  0% {
    width: 24px;
    height: 24px;
    opacity: 0.6;
    top: -12px;
    left: -12px;
    transform: scale(var(--ripple-scale, 1));
  }
  70% {
    width: 40px;
    height: 40px;
    opacity: 0.3;
    top: -20px;
    left: -20px;
    transform: scale(var(--ripple-scale, 1.2));
  }
  100% {
    width: 45px;
    height: 45px;
    opacity: 0;
    top: -22.5px;
    left: -22.5px;
    transform: scale(var(--ripple-scale, 1.3));
  }
}

@keyframes processing-pulse {
  0%,
  100% {
    width: 26px;
    height: 26px;
    opacity: 0.5;
    top: -13px;
    left: -13px;
  }
  50% {
    width: 34px;
    height: 34px;
    opacity: 0.2;
    top: -17px;
    left: -17px;
  }
}

@keyframes speaking-wave {
  0%,
  100% {
    width: 28px;
    height: 28px;
    opacity: 0.5;
    top: -14px;
    left: -14px;
  }
  50% {
    width: 38px;
    height: 38px;
    opacity: 0.2;
    top: -19px;
    left: -19px;
  }
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

/* Custom button padding class */
.custom-button-padding {
  --padding-start: 8px;
  --padding-end: 8px;
  height: 40px;
}
</style>

<template>
  <ion-toolbar color="light" class="chat-input-toolbar">
    <ion-textarea
      v-model="inputText"
      placeholder="Type a message..."
      :auto-grow="true"
      class="chat-textarea"
      :rows="1"
      @keydown.enter.prevent="handleEnterKey"
    ></ion-textarea>
    <ion-buttons slot="end" class="input-buttons">
      <ion-button fill="clear" :color="isRecording ? 'danger' : 'medium'" @click="togglePtt" class="ptt-button custom-button-padding">
        <ion-icon slot="icon-only" :icon="isRecording ? micOffOutline : micOutline"></ion-icon>
      </ion-button>
      <ion-button fill="clear" color="secondary" @click="sendMessage" :disabled="!inputText.trim() || isRecording" class="send-button custom-button-padding">
        <ion-icon slot="icon-only" :icon="sendOutline"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</template>
<script setup lang="ts">
import { ref, defineEmits, onUnmounted, watch } from 'vue';
import { IonTextarea, IonButtons, IonButton, IonIcon, IonToolbar, toastController } from '@ionic/vue';
import { sendOutline, micOutline, micOffOutline } from 'ionicons/icons';
import { useUiStore } from '../stores/uiStore';
import { Capacitor } from '@capacitor/core';
const inputText = ref('');
const isRecording = ref(false);
const uiStore = useUiStore();
// --- Web Speech API ---
// Note: SpeechRecognition may not be available in all browsers
const SpeechRecognition = window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;
const presentToast = async (message: string, duration: number = 2000, color: string = 'warning') => {
  const toast = await toastController.create({
    message: message,
    duration: duration,
    position: 'bottom',
    color: color,
  });
  await toast.present();
};
if (SpeechRecognition && !Capacitor.isNativePlatform()) {
  recognition = new SpeechRecognition();
  recognition.continuous = false; 
  recognition.interimResults = true; 
  recognition.lang = 'en-US'; 
  recognition.onstart = () => {
    isRecording.value = true;
  };
  recognition.onend = () => {
    if (isRecording.value) { 
        isRecording.value = false;
        emit('pttToggle', false);
    }
  };
  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interimTranscript = '';
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    if (finalTranscript.trim()) {
      inputText.value = finalTranscript.trim();
    } else if (interimTranscript.trim()) {
      inputText.value = interimTranscript.trim();
    }
  };
  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    let userMessage = 'Voice input error.';
    if (event.error === 'no-speech') {
      userMessage = 'No speech was detected. Please try again.';
    } else if (event.error === 'not-allowed') {
      userMessage = 'Microphone access denied. Please enable microphone permissions.';
    } else if (event.error === 'network') {
      userMessage = 'Network error during voice input.';
    } else {
      userMessage = `Voice input failed: ${event.error}`;
    }
    presentToast(userMessage, 3000, 'danger');
    if (isRecording.value) {
      isRecording.value = false;
      emit('pttToggle', false);
      uiStore.setPttRecording(false); 
    }
  };
} else if (!SpeechRecognition && !Capacitor.isNativePlatform()) {
  // Web Speech API is not supported in this browser
}
// --- End Web Speech API ---
const emit = defineEmits<{
  (e: 'sendMessage', text: string): void;
  (e: 'pttToggle', recordingState: boolean): void;
}>();
const sendMessage = () => {
  if (inputText.value.trim() && !isRecording.value) {
    emit('sendMessage', inputText.value.trim());
    inputText.value = '';
  }
};
const handleEnterKey = (event: KeyboardEvent) => {
  if (!event.shiftKey && !isRecording.value) {
    event.preventDefault();
    sendMessage();
  }
};
const togglePtt = async () => {
  if (Capacitor.isNativePlatform()) {
    // --- Native PTT (Capacitor Plugin) Logic Placeholder ---
    // TODO: Implement native speech recognition using a Capacitor plugin
    // e.g., @capacitor-community/speech-recognition
    // 1. Check permissions using plugin: SpeechRecognition.checkPermissions() / requestPermissions()
    // 2. If permissions granted:
    //    if (isRecording.value) {
    //      await SpeechRecognition.stop();
    //      isRecording.value = false; // Or manage via plugin events
    //    } else {
    //      inputText.value = ''; 
    //      await SpeechRecognition.start({
    //        language: 'en-US',
    //        partialResults: true,
    //        // Add listener for partial results: SpeechRecognition.addListener('partialResults', ...)
    //      });
    //      isRecording.value = true; // Or manage via plugin events
    //    }
    //    emit('pttToggle', isRecording.value);
    //    uiStore.setPttRecording(isRecording.value);
    // For now, just toggle and alert for native, to show it's different path
    isRecording.value = !isRecording.value;
    const nativePttMessage = `Native PTT: Recording ${isRecording.value ? 'started' : 'stopped'}. (Plugin not yet implemented)`;
    presentToast(nativePttMessage, 2000, isRecording.value ? 'success' : 'medium');
    emit('pttToggle', isRecording.value);
    uiStore.setPttRecording(isRecording.value);
    // --- End Native PTT Logic Placeholder ---
  } else if (recognition) { // Web Speech API path
    if (isRecording.value) {
      recognition.stop();
      // onend will set isRecording.value = false and emit
    } else {
      try {
        inputText.value = '';
        recognition.start();
        // onstart will set isRecording.value = true and emit
      } catch {
        isRecording.value = false; // Ensure consistent state
        emit('pttToggle', false);
        uiStore.setPttRecording(false);
        presentToast("Could not start voice input. Please try again.", 3000, 'danger');
      }
    }
  } else {
    presentToast('Voice input is not supported in your browser.', 3000, 'danger');
  }
};
watch(isRecording, (newValue) => {
  uiStore.setPttRecording(newValue);
});
onUnmounted(() => {
  if (recognition && isRecording.value && !Capacitor.isNativePlatform()) {
    recognition.stop();
  }
  // TODO: Add cleanup for native plugin listeners if implemented
});
</script>
<style scoped>
.chat-input-toolbar {
  --padding-start: 8px;
  --padding-end: 8px; /* Ensure space for buttons on the right */
  --padding-top: 4px;
  --padding-bottom: 4px;
  min-height: auto;
  display: flex;
  align-items: center;
}
.chat-textarea {
  flex-grow: 1;
  border: 1px solid var(--ion-color-medium-shade);
  border-radius: 20px;
  --padding-top: 8px !important; 
  --padding-bottom: 8px !important;
  --padding-start: 12px !important;
  --padding-end: 12px !important;
  line-height: 1.4;
  max-height: 100px;
  align-self: center;
  margin-right: 4px; /* Reduced margin as buttons will have padding */
}
.input-buttons {
  display: flex;
  align-items: center;
}
.custom-button-padding {
  --padding-start: 8px; /* Add horizontal padding */
  --padding-end: 8px;   /* Add horizontal padding */
  height: 2.75rem; /* 44px minimum touch target */
  /* min-width: 40px; /* Ensure horizontal touch target */
}
.ptt-button {
  /* Specific styles if needed */
}
.send-button {
  /* Specific styles if needed */
}
</style> 
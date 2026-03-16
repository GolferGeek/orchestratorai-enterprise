<template>
  <!-- Speech input button for agent request forms -->
  <ion-button
    fill="clear"
    size="small"
    :disabled="isListening"
    @click="toggleSpeech"
    :title="isListening ? 'Stop listening' : 'Start speech input'"
  >
    <ion-icon :icon="isListening ? stopCircleOutline : micOutline" slot="icon-only" />
  </ion-button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import { micOutline, stopCircleOutline } from 'ionicons/icons';

const emit = defineEmits<{
  transcript: [text: string];
}>();

const isListening = ref(false);
let recognition: SpeechRecognition | null = null;

function toggleSpeech() {
  if (isListening.value) {
    stopListening();
  } else {
    startListening();
  }
}

function startListening() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Speech recognition not supported in this browser');
    return;
  }

  const SpeechRecognitionCtor =
    (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
      .SpeechRecognition ||
    (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
      .webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) return;

  recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const transcript = event.results[0][0].transcript;
    emit('transcript', transcript);
  };

  recognition.onend = () => {
    isListening.value = false;
  };

  recognition.onerror = () => {
    isListening.value = false;
  };

  recognition.start();
  isListening.value = true;
}

function stopListening() {
  recognition?.stop();
  isListening.value = false;
}
</script>

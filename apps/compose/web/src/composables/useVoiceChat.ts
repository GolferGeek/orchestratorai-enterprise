/**
 * useVoiceChat.ts
 *
 * Composable that encapsulates the voice conversation loop:
 *   startListening  → MediaRecorder + silence detection → auto-stop
 *   stopListening   → assemble blob → POST /speech/transcribe → transcript
 *   speakResponse   → POST /speech/synthesize → base64 MP3 → Audio playback
 *   cancelSpeaking  → stop current audio
 *   toggleVoiceMode → flip isVoiceMode
 *   cleanup         → release mic/AudioContext resources
 *
 * Three-layer architecture: this is a composable (UI/logic layer).
 * Speech API calls are delegated to composeApiService (service layer).
 */

import { ref } from 'vue';
import type { Ref } from 'vue';
import { composeApiService } from '@/services/compose-api.service';

// ============================================================================
// Types
// ============================================================================

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'processing' | 'speaking';

// ============================================================================
// Silence detection constants
// ============================================================================

const SILENCE_CHECK_INTERVAL_MS = 200;
const SILENCE_THRESHOLD_RMS = 0.01;  // below this RMS = silence
const SILENCE_DURATION_MS = 1500;    // sustained silence before auto-stop

// ============================================================================
// Composable
// ============================================================================

export function useVoiceChat(): {
  voiceState: Ref<VoiceState>;
  isVoiceMode: Ref<boolean>;
  transcript: Ref<string>;
  error: Ref<string | null>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<string>;
  speakResponse: (text: string) => Promise<void>;
  cancelSpeaking: () => void;
  toggleVoiceMode: () => void;
  cleanup: () => void;
} {
  const voiceState = ref<VoiceState>('idle');
  const isVoiceMode = ref(false);
  const transcript = ref('');
  const error = ref<string | null>(null);

  // Internal refs — not exposed
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let silenceCheckTimer: ReturnType<typeof setInterval> | null = null;
  let silenceSinceMs: number | null = null;
  let currentAudio: HTMLAudioElement | null = null;
  let currentObjectUrl: string | null = null;

  // ============================================================================
  // Internal helpers
  // ============================================================================

  function clearSilenceDetection(): void {
    if (silenceCheckTimer !== null) {
      clearInterval(silenceCheckTimer);
      silenceCheckTimer = null;
    }
    silenceSinceMs = null;
  }

  function revokeCurrentObjectUrl(): void {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  }

  function startSilenceDetection(onSilence: () => void): void {
    if (!analyserNode) return;

    const bufferLength = analyserNode.fftSize;
    const dataArray = new Float32Array(bufferLength);

    silenceCheckTimer = setInterval(() => {
      if (!analyserNode) return;
      analyserNode.getFloatTimeDomainData(dataArray);

      // Calculate RMS (root mean square) as a volume proxy
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);

      if (rms < SILENCE_THRESHOLD_RMS) {
        if (silenceSinceMs === null) {
          silenceSinceMs = Date.now();
        } else if (Date.now() - silenceSinceMs >= SILENCE_DURATION_MS) {
          clearSilenceDetection();
          onSilence();
        }
      } else {
        // Reset silence timer on sound
        silenceSinceMs = null;
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  }

  // ============================================================================
  // startListening
  // ============================================================================

  async function startListening(): Promise<void> {
    error.value = null;
    audioChunks = [];

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Microphone access denied';
      error.value = message;
      throw new Error(message);
    }

    // Set up AudioContext + AnalyserNode for silence detection
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    source.connect(analyserNode);

    // Prefer audio/webm;codecs=opus (Chrome), fall back to browser default
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : '';

    const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
    mediaRecorder = new MediaRecorder(mediaStream, recorderOptions);

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(100); // collect chunks every 100ms
    voiceState.value = 'listening';

    // Wire silence detection to auto-stop
    startSilenceDetection(() => {
      if (voiceState.value === 'listening') {
        stopListening().catch((err) => {
          const message = err instanceof Error ? err.message : 'Transcription failed';
          error.value = message;
          voiceState.value = 'idle';
        });
      }
    });
  }

  // ============================================================================
  // stopListening
  // ============================================================================

  async function stopListening(): Promise<string> {
    clearSilenceDetection();

    if (!mediaRecorder) {
      voiceState.value = 'idle';
      return '';
    }

    // Wait for the recorder to flush its final chunk
    const recordingDone = new Promise<void>((resolve) => {
      if (!mediaRecorder) {
        resolve();
        return;
      }
      mediaRecorder.addEventListener('stop', () => resolve(), { once: true });
    });

    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    await recordingDone;
    mediaRecorder = null;

    // Release mic tracks
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    // Close AudioContext
    if (audioContext) {
      await audioContext.close().catch(() => undefined);
      audioContext = null;
      analyserNode = null;
    }

    if (audioChunks.length === 0) {
      voiceState.value = 'idle';
      return '';
    }

    voiceState.value = 'transcribing';

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    audioChunks = [];

    const result = await composeApiService.speechTranscribe(audioBlob);
    transcript.value = result;
    voiceState.value = 'idle';
    return result;
  }

  // ============================================================================
  // speakResponse
  // ============================================================================

  async function speakResponse(text: string): Promise<void> {
    if (!text) return;

    // Stop any currently playing audio
    cancelSpeaking();

    voiceState.value = 'speaking';
    error.value = null;

    const base64Audio = await composeApiService.speechSynthesize(text);

    // Decode base64 to ArrayBuffer → Blob → Object URL
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });

    revokeCurrentObjectUrl();
    currentObjectUrl = URL.createObjectURL(audioBlob);

    const audio = new Audio(currentObjectUrl);
    currentAudio = audio;

    audio.addEventListener('ended', () => {
      currentAudio = null;
      revokeCurrentObjectUrl();
      voiceState.value = 'idle';
    }, { once: true });

    audio.addEventListener('error', () => {
      currentAudio = null;
      revokeCurrentObjectUrl();
      error.value = 'Audio playback failed';
      voiceState.value = 'idle';
    }, { once: true });

    await audio.play();
  }

  // ============================================================================
  // cancelSpeaking
  // ============================================================================

  function cancelSpeaking(): void {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    revokeCurrentObjectUrl();
    if (voiceState.value === 'speaking') {
      voiceState.value = 'idle';
    }
  }

  // ============================================================================
  // toggleVoiceMode
  // ============================================================================

  function toggleVoiceMode(): void {
    const turningOff = isVoiceMode.value;
    isVoiceMode.value = !isVoiceMode.value;

    if (turningOff) {
      // Cancel any active listening or speaking
      if (voiceState.value === 'listening') {
        clearSilenceDetection();
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        mediaRecorder = null;
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
          mediaStream = null;
        }
        if (audioContext) {
          audioContext.close().catch(() => undefined);
          audioContext = null;
          analyserNode = null;
        }
        audioChunks = [];
      }
      cancelSpeaking();
      voiceState.value = 'idle';
    }
  }

  // ============================================================================
  // cleanup
  // ============================================================================

  function cleanup(): void {
    clearSilenceDetection();
    cancelSpeaking();

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    mediaRecorder = null;

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => undefined);
      audioContext = null;
      analyserNode = null;
    }

    audioChunks = [];
    voiceState.value = 'idle';
  }

  return {
    voiceState,
    isVoiceMode,
    transcript,
    error,
    startListening,
    stopListening,
    speakResponse,
    cancelSpeaking,
    toggleVoiceMode,
    cleanup,
  };
}

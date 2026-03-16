/**
 * useSharedTimer
 *
 * Manages the shared team or global pomodoro timer.
 * Polls timer state every 5 seconds from the Flow API.
 * Maintains a local countdown that decrements every second.
 * Calls onTimerComplete when a focus session ends.
 */
import { ref, computed, onUnmounted } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import type { TimerStateResponseDto, CreateTimerStateDto, UpdateTimerStateDto } from '@/types/flow';

const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;

function playTimerEndSound(): void {
  const AudioContextClass =
    window.AudioContext ||
    (window as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextClass();

  const playNote = (frequency: number, startTime: number, duration: number) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.4, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  };

  const now = audioContext.currentTime;
  playNote(523.25, now, 0.3);
  playNote(659.25, now + 0.15, 0.3);
  playNote(783.99, now + 0.3, 0.4);
}

export function useSharedTimer(
  onTimerComplete?: () => void,
  teamId?: string | null,
) {
  const timerState = ref<TimerStateResponseDto | null>(null);
  const timeLeft = ref(DEFAULT_FOCUS_MINUTES * 60);
  const loading = ref(true);
  const focusMinutes = ref(DEFAULT_FOCUS_MINUTES);
  const breakMinutes = ref(DEFAULT_BREAK_MINUTES);
  const autoContinue = ref(true);
  let hasCompleted = false;

  const isRunning = computed(() => timerState.value?.isRunning ?? false);
  const isBreak = computed(() => timerState.value?.isBreak ?? false);

  const isGlobal = teamId === undefined || teamId === null;

  // ── API helpers ─────────────────────────────────────────────────────────────

  async function fetchTimerState(): Promise<TimerStateResponseDto | null> {
    if (isGlobal) return flowApiService.getGlobalTimerState();
    return flowApiService.getTimerState(teamId!);
  }

  async function createTimerState(dto: CreateTimerStateDto): Promise<TimerStateResponseDto> {
    if (isGlobal) return flowApiService.createGlobalTimerState(dto);
    return flowApiService.createTimerState(teamId!, dto);
  }

  async function updateTimerState(
    timerId: string,
    dto: UpdateTimerStateDto,
  ): Promise<TimerStateResponseDto> {
    if (isGlobal) return flowApiService.updateGlobalTimerState(timerId, dto);
    return flowApiService.updateTimerState(teamId!, timerId, dto);
  }

  // ── Polling ──────────────────────────────────────────────────────────────────

  async function loadTimer() {
    try {
      let state = await fetchTimerState();
      if (!state) {
        state = await createTimerState({
          durationSeconds: DEFAULT_FOCUS_MINUTES * 60,
          isRunning: false,
          isBreak: false,
        });
      }
      timerState.value = state;
    } catch (error) {
      console.error('Error fetching timer state:', error);
    } finally {
      loading.value = false;
    }
  }

  const pollInterval = setInterval(loadTimer, 5000);
  loadTimer();

  // ── Local countdown ──────────────────────────────────────────────────────────

  const countdownInterval = setInterval(() => {
    const state = timerState.value;
    if (!state?.isRunning || !state.endTime) {
      timeLeft.value = state?.durationSeconds ?? DEFAULT_FOCUS_MINUTES * 60;
      return;
    }

    const endTime = new Date(state.endTime).getTime();
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    timeLeft.value = remaining;

    if (remaining === 0 && !hasCompleted) {
      hasCompleted = true;
      playTimerEndSound();

      if (!state.isBreak) {
        onTimerComplete?.();
      }

      if (autoContinue.value) {
        setTimeout(() => handleAutoContinue(), 1000);
      } else {
        handleStop();
      }
    }
  }, 1000);

  // ── Auto-continue ────────────────────────────────────────────────────────────

  async function handleAutoContinue() {
    const state = timerState.value;
    if (!state) return;

    const newIsBreak = !state.isBreak;
    const newDuration = newIsBreak
      ? breakMinutes.value * 60
      : focusMinutes.value * 60;
    const endTime = new Date(Date.now() + newDuration * 1000).toISOString();

    const updated = await updateTimerState(state.id, {
      isRunning: true,
      isBreak: newIsBreak,
      durationSeconds: newDuration,
      endTime,
    });
    timerState.value = updated;
    hasCompleted = false;
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleStart() {
    const state = timerState.value;
    if (!state) return;

    hasCompleted = false;
    const endTime = new Date(Date.now() + state.durationSeconds * 1000).toISOString();
    const updated = await updateTimerState(state.id, { isRunning: true, endTime });
    timerState.value = updated;
  }

  async function handlePause() {
    const state = timerState.value;
    if (!state) return;

    const updated = await updateTimerState(state.id, {
      isRunning: false,
      durationSeconds: timeLeft.value,
      endTime: undefined,
    });
    timerState.value = updated;
  }

  async function handleStop() {
    const state = timerState.value;
    if (!state) return;

    const updated = await updateTimerState(state.id, {
      isRunning: false,
      isBreak: false,
      durationSeconds: focusMinutes.value * 60,
      endTime: undefined,
    });
    timerState.value = updated;
  }

  async function handleReset() {
    const state = timerState.value;
    if (!state) return;

    const newDuration = state.isBreak
      ? breakMinutes.value * 60
      : focusMinutes.value * 60;

    const updated = await updateTimerState(state.id, {
      isRunning: false,
      durationSeconds: newDuration,
      endTime: undefined,
    });
    timerState.value = updated;
  }

  async function toggleBreak() {
    const state = timerState.value;
    if (!state) return;

    const newIsBreak = !state.isBreak;
    const newDuration = newIsBreak
      ? breakMinutes.value * 60
      : focusMinutes.value * 60;

    const updated = await updateTimerState(state.id, {
      isRunning: false,
      isBreak: newIsBreak,
      durationSeconds: newDuration,
      endTime: undefined,
    });
    timerState.value = updated;
  }

  async function setCustomDurations(
    newFocusMinutes: number,
    newBreakMinutes: number,
  ) {
    focusMinutes.value = newFocusMinutes;
    breakMinutes.value = newBreakMinutes;

    const state = timerState.value;
    if (!state || state.isRunning) return;

    const newDuration = state.isBreak
      ? newBreakMinutes * 60
      : newFocusMinutes * 60;

    const updated = await updateTimerState(state.id, { durationSeconds: newDuration });
    timerState.value = updated;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  onUnmounted(() => {
    clearInterval(pollInterval);
    clearInterval(countdownInterval);
  });

  return {
    timerState,
    timeLeft,
    isRunning,
    isBreak,
    loading,
    focusMinutes,
    breakMinutes,
    autoContinue,
    handleStart,
    handlePause,
    handleStop,
    handleReset,
    toggleBreak,
    setCustomDurations,
  };
}

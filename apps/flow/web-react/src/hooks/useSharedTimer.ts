import { useState, useEffect, useCallback, useRef } from 'react';
import { flowApiService, TimerStateResponseDto, CreateTimerStateDto, UpdateTimerStateDto } from '@/services/flowApiService';

interface TimerState {
  id: string;
  end_time: string | null;
  is_running: boolean;
  is_break: boolean;
  duration_seconds: number;
}

// Map API response to TimerState interface
function mapTimerStateResponse(state: TimerStateResponseDto): TimerState {
  return {
    id: state.id,
    end_time: state.endTime,
    is_running: state.isRunning,
    is_break: state.isBreak,
    duration_seconds: state.durationSeconds,
  };
}

const playTimerEndSound = () => {
  const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
};

// Default durations in minutes
const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;

export function useSharedTimer(onTimerComplete?: () => void, teamId?: string | null) {
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_FOCUS_MINUTES * 60);
  const [loading, setLoading] = useState(true);
  const [focusMinutes, setFocusMinutes] = useState(DEFAULT_FOCUS_MINUTES);
  const [breakMinutes, setBreakMinutes] = useState(DEFAULT_BREAK_MINUTES);
  const [autoContinue, setAutoContinue] = useState(true);
  const hasCompletedRef = useRef(false);

  // Determine if we're using global or team-scoped timer
  const isGlobal = teamId === undefined || teamId === null;

  // Helper: fetch timer state (global or team-scoped)
  const fetchTimerState = useCallback(async (): Promise<TimerStateResponseDto | null> => {
    if (isGlobal) {
      return flowApiService.getGlobalTimerState();
    }
    return flowApiService.getTimerState(teamId!);
  }, [isGlobal, teamId]);

  // Helper: create timer state (global or team-scoped)
  const createTimerState = useCallback(async (dto: CreateTimerStateDto): Promise<TimerStateResponseDto> => {
    if (isGlobal) {
      return flowApiService.createGlobalTimerState(dto);
    }
    return flowApiService.createTimerState(teamId!, dto);
  }, [isGlobal, teamId]);

  // Helper: update timer state (global or team-scoped)
  const updateTimerState = useCallback(async (timerId: string, dto: UpdateTimerStateDto): Promise<TimerStateResponseDto> => {
    if (isGlobal) {
      return flowApiService.updateGlobalTimerState(timerId, dto);
    }
    return flowApiService.updateTimerState(teamId!, timerId, dto);
  }, [isGlobal, teamId]);

  // Fetch initial timer state
  useEffect(() => {
    const fetchTimer = async () => {
      try {
        let state = await fetchTimerState();

        if (!state) {
          // Create a new timer state if none exists
          const dto: CreateTimerStateDto = {
            durationSeconds: DEFAULT_FOCUS_MINUTES * 60,
            isRunning: false,
            isBreak: false,
          };
          state = await createTimerState(dto);
        }

        setTimerState(mapTimerStateResponse(state));
      } catch (error) {
        console.error('Error fetching timer:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTimer();

    // Poll for updates every 2 seconds
    const interval = setInterval(fetchTimer, 2000);
    return () => clearInterval(interval);
  }, [fetchTimerState, createTimerState]);

  // Auto-continue: switch modes and restart when timer ends
  const handleAutoContinue = useCallback(async () => {
    if (!timerState) return;

    const newIsBreak = !timerState.is_break;
    const newDuration = newIsBreak ? breakMinutes * 60 : focusMinutes * 60;
    const endTime = new Date(Date.now() + newDuration * 1000).toISOString();

    const dto: UpdateTimerStateDto = {
      isRunning: true,
      isBreak: newIsBreak,
      durationSeconds: newDuration,
      endTime,
    };

    try {
      const updated = await updateTimerState(timerState.id, dto);
      setTimerState(mapTimerStateResponse(updated));
    } catch (error) {
      console.error('Error auto-continuing timer:', error);
    }
  }, [timerState, focusMinutes, breakMinutes, updateTimerState]);

  // Update time left based on timer state
  useEffect(() => {
    if (!timerState) return;

    if (timerState.is_running && timerState.end_time) {
      const updateTimeLeft = () => {
        const endTime = new Date(timerState.end_time!).getTime();
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
        setTimeLeft(remaining);

        if (remaining === 0 && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          playTimerEndSound();
          // Only call onTimerComplete for focus sessions, not breaks
          if (!timerState.is_break) {
            onTimerComplete?.();
          }

          if (autoContinue) {
            // Small delay before auto-continuing to let the sound play
            setTimeout(() => {
              handleAutoContinue();
            }, 1000);
          } else {
            handleStop();
          }
        }
      };

      updateTimeLeft();
      const interval = setInterval(updateTimeLeft, 100);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(timerState.duration_seconds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleStop is defined after this effect, using ref pattern would add complexity
  }, [timerState, onTimerComplete, autoContinue, handleAutoContinue]);

  const handleStart = useCallback(async () => {
    if (!timerState) return;

    hasCompletedRef.current = false;
    const durationMs = timerState.duration_seconds * 1000;
    const endTime = new Date(Date.now() + durationMs).toISOString();

    const dto: UpdateTimerStateDto = {
      isRunning: true,
      endTime,
    };

    try {
      const updated = await updateTimerState(timerState.id, dto);
      setTimerState(mapTimerStateResponse(updated));
    } catch (error) {
      console.error('Error starting timer:', error);
    }
  }, [timerState, updateTimerState]);

  const handlePause = useCallback(async () => {
    if (!timerState) return;

    const dto: UpdateTimerStateDto = {
      isRunning: false,
      durationSeconds: timeLeft,
      endTime: null,
    };

    try {
      const updated = await updateTimerState(timerState.id, dto);
      setTimerState(mapTimerStateResponse(updated));
    } catch (error) {
      console.error('Error pausing timer:', error);
    }
  }, [timerState, timeLeft, updateTimerState]);

  const handleStop = useCallback(async () => {
    if (!timerState) return;

    const dto: UpdateTimerStateDto = {
      isRunning: false,
      isBreak: false,
      durationSeconds: focusMinutes * 60,
      endTime: null,
    };

    try {
      const updated = await updateTimerState(timerState.id, dto);
      setTimerState(mapTimerStateResponse(updated));
    } catch (error) {
      console.error('Error stopping timer:', error);
    }
  }, [timerState, focusMinutes, updateTimerState]);

  const handleReset = useCallback(async () => {
    if (!timerState) return;

    const newDuration = timerState.is_break ? breakMinutes * 60 : focusMinutes * 60;

    const dto: UpdateTimerStateDto = {
      isRunning: false,
      durationSeconds: newDuration,
      endTime: null,
    };

    try {
      const updated = await updateTimerState(timerState.id, dto);
      setTimerState(mapTimerStateResponse(updated));
    } catch (error) {
      console.error('Error resetting timer:', error);
    }
  }, [timerState, focusMinutes, breakMinutes, updateTimerState]);

  const toggleBreak = useCallback(async () => {
    if (!timerState) return;

    const newIsBreak = !timerState.is_break;
    const newDuration = newIsBreak ? breakMinutes * 60 : focusMinutes * 60;

    const dto: UpdateTimerStateDto = {
      isRunning: false,
      isBreak: newIsBreak,
      durationSeconds: newDuration,
      endTime: null,
    };

    try {
      const updated = await updateTimerState(timerState.id, dto);
      setTimerState(mapTimerStateResponse(updated));
    } catch (error) {
      console.error('Error toggling break:', error);
    }
  }, [timerState, focusMinutes, breakMinutes, updateTimerState]);

  const setCustomDurations = useCallback(async (newFocusMinutes: number, newBreakMinutes: number) => {
    setFocusMinutes(newFocusMinutes);
    setBreakMinutes(newBreakMinutes);

    if (!timerState || timerState.is_running) return;

    const newDuration = timerState.is_break ? newBreakMinutes * 60 : newFocusMinutes * 60;

    const dto: UpdateTimerStateDto = {
      durationSeconds: newDuration,
    };

    try {
      const updated = await updateTimerState(timerState.id, dto);
      setTimerState(mapTimerStateResponse(updated));
    } catch (error) {
      console.error('Error setting custom durations:', error);
    }
  }, [timerState, updateTimerState]);

  return {
    timeLeft,
    isRunning: timerState?.is_running ?? false,
    isBreak: timerState?.is_break ?? false,
    loading,
    focusMinutes,
    breakMinutes,
    autoContinue,
    setAutoContinue,
    setCustomDurations,
    handleStart,
    handlePause,
    handleReset,
    toggleBreak,
  };
}

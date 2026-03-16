import { useCallback, useRef, useEffect } from 'react';

const NOTIFICATION_CHANNEL = 'notification-broadcast';

export function useNotificationSound() {
  const playNotificationSoundRef = useRef<() => void>(() => {});

  const playNotificationSound = useCallback(() => {
    // Create a simple notification beep using Web Audio API
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioContextClass();

    // Create oscillator for the beep
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 880; // A5 note
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    // Second beep
    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();

      osc2.connect(gain2);
      gain2.connect(audioContext.destination);

      osc2.frequency.value = 1046.5; // C6 note
      osc2.type = 'sine';

      gain2.gain.setValueAtTime(0.5, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.5);
    }, 200);
  }, []);

  // Keep ref in sync with the callback
  useEffect(() => {
    playNotificationSoundRef.current = playNotificationSound;
  }, [playNotificationSound]);

  const broadcastNotification = useCallback(async () => {
    playNotificationSound();
  }, [playNotificationSound]);

  return {
    broadcastNotification,
    playNotificationSound,
  };
}

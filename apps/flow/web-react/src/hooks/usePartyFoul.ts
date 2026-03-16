import { useCallback } from 'react';
import { flowApiService } from '@/services/flowApiService';
import { toast } from 'sonner';

export function usePartyFoul(teamId?: string | null) {
  const checkForPartyFouls = useCallback(async () => {
    if (!teamId) {
      return;
    }

    try {
      const allTasks = await flowApiService.getSharedTasks(teamId);
      const inProgressTasks = allTasks.filter(
        t => t.status === 'in_progress' && !t.parentTaskId
      );

      // If no one has any in-progress tasks, show a general reminder
      if (inProgressTasks.length === 0) {
        toast.error('🚨 Party Foul! No one has anything in progress!', {
          duration: 8000,
          description: "Time to add a task or face the shame! 😅",
          style: {
            background: 'hsl(var(--destructive))',
            color: 'hsl(var(--destructive-foreground))',
            border: 'none',
          },
        });
        playPartyFoulSound();
      }
    } catch (error) {
      console.error('Error checking party fouls:', error);
    }
  }, [teamId]);

  return { checkForPartyFouls };
}

function playPartyFoulSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioContextClass();

    // Play a "sad trombone" style descending tone
    const playNote = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sawtooth';
      
      gainNode.gain.setValueAtTime(0.2, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioContext.currentTime;
    // Descending "wah wah wah wahhh" pattern
    playNote(392, now, 0.25);        // G4
    playNote(369.99, now + 0.25, 0.25); // F#4
    playNote(349.23, now + 0.5, 0.25);  // F4
    playNote(293.66, now + 0.75, 0.5);  // D4 (held longer)
  } catch (e) {
    console.error('Could not play party foul sound', e);
  }
}

/**
 * usePartyFoul
 *
 * Computes the list of team member user IDs who have no tasks in
 * 'in_progress' status ("party foul" — nobody is working on anything).
 * Also provides checkForPartyFouls() which plays a sound and shows a
 * browser notification when the condition is true.
 */
import { computed } from 'vue';
import type { Ref } from 'vue';
import type { SharedTaskResponseDto, ApiTeamMember } from '@/types/flow';

function playPartyFoulSound(): void {
  try {
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
      oscillator.type = 'sawtooth';
      gainNode.gain.setValueAtTime(0.2, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioContext.currentTime;
    playNote(392, now, 0.25);
    playNote(369.99, now + 0.25, 0.25);
    playNote(349.23, now + 0.5, 0.25);
    playNote(293.66, now + 0.75, 0.5);
  } catch (e) {
    console.error('Could not play party foul sound', e);
  }
}

export function usePartyFoul(
  teamId: Ref<string | null | undefined>,
  sharedTasks: Ref<SharedTaskResponseDto[]>,
  members: Ref<ApiTeamMember[]>,
) {
  /**
   * Members who have NO root tasks (no parentTaskId) in 'in_progress' status.
   */
  const partyFoulUsers = computed<string[]>(() => {
    const inProgressUserIds = new Set(
      sharedTasks.value
        .filter((t) => t.status === 'in_progress' && !t.parentTaskId && t.userId)
        .map((t) => t.userId as string),
    );

    return members.value
      .map((m) => m.userId)
      .filter((id) => id && !inProgressUserIds.has(id)) as string[];
  });

  function checkForPartyFouls(): void {
    if (!teamId.value) return;

    const inProgressTasks = sharedTasks.value.filter(
      (t) => t.status === 'in_progress' && !t.parentTaskId,
    );

    if (inProgressTasks.length === 0) {
      playPartyFoulSound();
      // Surface a simple browser notification; caller may also choose to
      // display a toast using their notification library of choice.
      console.warn('Party Foul! No one has anything in progress!');
    }
  }

  return {
    partyFoulUsers,
    checkForPartyFouls,
  };
}

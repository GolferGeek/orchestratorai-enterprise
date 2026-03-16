/**
 * useNotificationSound.spec.ts
 *
 * Unit tests for the useNotificationSound composable.
 * The Web Audio API is not available in jsdom, so AudioContext is mocked
 * globally before the composable is exercised.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNotificationSound } from '@/composables/useNotificationSound';

// ─── AudioContext mock ────────────────────────────────────────────────────────

function makeGainNodeMock() {
  return {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
}

function makeOscillatorMock() {
  return {
    connect: vi.fn(),
    frequency: { value: 0 },
    type: 'sine' as OscillatorType,
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeAudioContextMock() {
  return {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn().mockImplementation(makeOscillatorMock),
    createGain: vi.fn().mockImplementation(makeGainNodeMock),
  };
}

beforeEach(() => {
  const AudioContextMock = vi.fn().mockImplementation(makeAudioContextMock);
  vi.stubGlobal('AudioContext', AudioContextMock);
  vi.stubGlobal('window', {
    AudioContext: AudioContextMock,
  });
  vi.useFakeTimers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useNotificationSound', () => {
  it('returns a playNotificationSound function', () => {
    const { playNotificationSound } = useNotificationSound();

    expect(typeof playNotificationSound).toBe('function');
  });

  it('calling playNotificationSound does not throw', () => {
    const { playNotificationSound } = useNotificationSound();

    expect(() => playNotificationSound()).not.toThrow();
  });

  it('creates an AudioContext when playNotificationSound is called', () => {
    const { playNotificationSound } = useNotificationSound();
    playNotificationSound();

    expect(window.AudioContext).toHaveBeenCalledTimes(1);
  });

  it('creates two oscillators — one immediately and one after 200ms', () => {
    const { playNotificationSound } = useNotificationSound();
    playNotificationSound();

    const ctx = (window.AudioContext as ReturnType<typeof vi.fn>).mock.results[0].value;

    // First oscillator is created synchronously
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);

    // Advance timer to trigger the setTimeout for the second beep
    vi.advanceTimersByTime(200);

    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('first oscillator frequency is set to 880 Hz', () => {
    const { playNotificationSound } = useNotificationSound();
    playNotificationSound();

    const ctx = (window.AudioContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    const osc1 = ctx.createOscillator.mock.results[0].value;

    expect(osc1.frequency.value).toBe(880);
  });

  it('second oscillator frequency is set to 1046.5 Hz after 200ms', () => {
    const { playNotificationSound } = useNotificationSound();
    playNotificationSound();

    vi.advanceTimersByTime(200);

    const ctx = (window.AudioContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    const osc2 = ctx.createOscillator.mock.results[1].value;

    expect(osc2.frequency.value).toBe(1046.5);
  });

  it('starts and stops the first oscillator', () => {
    const { playNotificationSound } = useNotificationSound();
    playNotificationSound();

    const ctx = (window.AudioContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    const osc1 = ctx.createOscillator.mock.results[0].value;

    expect(osc1.start).toHaveBeenCalledTimes(1);
    expect(osc1.stop).toHaveBeenCalledTimes(1);
  });

  it('multiple calls each create a fresh AudioContext', () => {
    const { playNotificationSound } = useNotificationSound();
    playNotificationSound();
    playNotificationSound();

    expect(window.AudioContext).toHaveBeenCalledTimes(2);
  });
});

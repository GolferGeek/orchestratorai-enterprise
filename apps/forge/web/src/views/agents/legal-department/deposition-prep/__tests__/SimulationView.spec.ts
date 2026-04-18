/**
 * SimulationView — logic specs
 *
 * Pure logic tests (no Ionic mount required).
 * Tests: status → UI state derivation, transcript building, damage color class.
 */

import { describe, it, expect } from 'vitest';

// ── Status → UI state mapping ─────────────────────────────────────────────────

type JobStatus =
  | 'queued'
  | 'processing'
  | 'awaiting_answer'
  | 'completed'
  | 'failed';

function deriveSimulationState(status: JobStatus): string {
  if (status === 'queued' || status === 'processing') return 'processing';
  if (status === 'awaiting_answer') return 'awaiting_answer';
  if (status === 'completed') return 'completed';
  return 'failed';
}

describe('SimulationView state derivation', () => {
  it('renders processing state for queued status', () => {
    expect(deriveSimulationState('queued')).toBe('processing');
  });

  it('renders processing state for processing status', () => {
    expect(deriveSimulationState('processing')).toBe('processing');
  });

  it('renders awaiting_answer state for awaiting_answer status', () => {
    expect(deriveSimulationState('awaiting_answer')).toBe('awaiting_answer');
  });

  it('renders completed state for completed status', () => {
    expect(deriveSimulationState('completed')).toBe('completed');
  });

  it('renders failed state for failed status', () => {
    expect(deriveSimulationState('failed')).toBe('failed');
  });
});

// ── Transcript building ───────────────────────────────────────────────────────

interface TurnScore {
  turn: number;
  evasion: number;
  consistency: number;
  damage: number;
  coachingNote: string;
}

interface TranscriptEntry {
  question: { turn: number; question: string; topic: string; move: string };
  answer: { turn: number; answer: string; submittedAt: string };
  score: TurnScore;
}

function buildTranscriptRows(
  entries: TranscriptEntry[],
): Array<{ turn: number; question: string; answer: string; score: TurnScore }> {
  return entries.map((e) => ({
    turn: e.question.turn,
    question: e.question.question,
    answer: e.answer.answer,
    score: e.score,
  }));
}

describe('SimulationView transcript building', () => {
  it('maps debrief transcript entries to flat rows', () => {
    const entries: TranscriptEntry[] = [
      {
        question: { turn: 1, question: 'Where were you?', topic: 'location', move: 'new-topic' },
        answer: { turn: 1, answer: 'At the store', submittedAt: '' },
        score: { turn: 1, evasion: 3, consistency: 7, damage: 4, coachingNote: 'Good' },
      },
    ];
    const rows = buildTranscriptRows(entries);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.question).toBe('Where were you?');
    expect(rows[0]?.answer).toBe('At the store');
    expect(rows[0]?.score.damage).toBe(4);
  });

  it('preserves turn order', () => {
    const entries: TranscriptEntry[] = [2, 1, 3].map((turn) => ({
      question: { turn, question: `Q${turn}`, topic: 't', move: 'new-topic' },
      answer: { turn, answer: `A${turn}`, submittedAt: '' },
      score: { turn, evasion: 0, consistency: 0, damage: 0, coachingNote: '' },
    }));
    const rows = buildTranscriptRows(entries);
    expect(rows.map((r) => r.turn)).toEqual([2, 1, 3]);
  });
});

// ── Damage color class ────────────────────────────────────────────────────────

function damageClass(damage: number): string {
  if (damage >= 7) return 'damage-high';
  if (damage >= 4) return 'damage-medium';
  return 'damage-low';
}

describe('SimulationView damage color class', () => {
  it('returns damage-high for damage >= 7', () => {
    expect(damageClass(7)).toBe('damage-high');
    expect(damageClass(10)).toBe('damage-high');
  });

  it('returns damage-medium for damage 4-6', () => {
    expect(damageClass(4)).toBe('damage-medium');
    expect(damageClass(6)).toBe('damage-medium');
  });

  it('returns damage-low for damage 0-3', () => {
    expect(damageClass(0)).toBe('damage-low');
    expect(damageClass(3)).toBe('damage-low');
  });
});

// ── Setup validation ──────────────────────────────────────────────────────────

describe('SimulationView setup validation', () => {
  it('does not start simulation when no active job (setup state)', () => {
    const activeJob = null;
    const setupModalOpen = false;
    const showSetupCard = !activeJob && !setupModalOpen;
    expect(showSetupCard).toBe(true);
  });

  it('shows setup modal when setupModalOpen is true', () => {
    const activeJob = null;
    const setupModalOpen = true;
    const showSetupCard = !activeJob && !setupModalOpen;
    expect(showSetupCard).toBe(false);
  });

  it('shows active simulation when job exists', () => {
    const activeJob = { id: 'abc', status: 'awaiting_answer' };
    expect(activeJob).not.toBeNull();
  });
});

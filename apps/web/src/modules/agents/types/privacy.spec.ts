import { describe, expect, it } from 'vitest';
import { readPrivacySummary } from './privacy';

describe('readPrivacySummary', () => {
  it('reads a well-formed summary off message metadata', () => {
    const summary = readPrivacySummary({
      provider: 'openai',
      privacy: {
        piiDetected: true,
        flaggedCount: 2,
        pseudonymCount: 1,
        redactionCount: 1,
        dataTypes: ['email', 'name'],
        status: 'applied',
        routing: 'external',
        reversed: true,
      },
    });

    expect(summary).toEqual({
      piiDetected: true,
      flaggedCount: 2,
      pseudonymCount: 1,
      redactionCount: 1,
      dataTypes: ['email', 'name'],
      status: 'applied',
      routing: 'external',
      reversed: true,
    });
  });

  it('returns null for messages that predate the field', () => {
    expect(readPrivacySummary({ provider: 'openai', model: 'gpt-4' })).toBeNull();
    expect(readPrivacySummary(undefined)).toBeNull();
    expect(readPrivacySummary(null)).toBeNull();
  });

  it('returns null when privacy is present but not a usable shape', () => {
    // History rows come back as loose JSON; a truncated or hand-edited blob
    // must not render as a badge row full of NaN.
    expect(readPrivacySummary({ privacy: 'applied' })).toBeNull();
    expect(readPrivacySummary({ privacy: {} })).toBeNull();
    expect(readPrivacySummary({ privacy: { status: 'applied' } })).toBeNull();
  });

  it('fills in missing counters rather than propagating undefined', () => {
    const summary = readPrivacySummary({
      privacy: { routing: 'local' },
    });

    expect(summary).toEqual({
      piiDetected: false,
      flaggedCount: 0,
      pseudonymCount: 0,
      redactionCount: 0,
      dataTypes: [],
      status: 'none',
      routing: 'local',
      reversed: false,
    });
  });

  it('treats any routing value other than local as external', () => {
    expect(readPrivacySummary({ privacy: { routing: 'anthropic' } })?.routing).toBe(
      'external',
    );
    expect(readPrivacySummary({ privacy: { routing: 'local' } })?.routing).toBe(
      'local',
    );
  });

  it('never surfaces values the server was not supposed to send', () => {
    // Defense in depth: if a value ever leaked into the summary server-side,
    // the reader drops it because it only copies known count/label fields.
    const summary = readPrivacySummary({
      privacy: {
        routing: 'external',
        pseudonymCount: 1,
        pseudonymsApplied: [{ original: 'Jane Roe', pseudonym: 'PERSON_1' }],
        originalText: 'Email Jane Roe',
      },
    });

    expect(JSON.stringify(summary)).not.toContain('Jane Roe');
    expect(JSON.stringify(summary)).not.toContain('PERSON_1');
  });
});

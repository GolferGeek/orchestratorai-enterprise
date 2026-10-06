import type { DatabaseService } from '@/database';
import { PIIPatternService, isDecimalFraction, passesLuhn } from '../pii-pattern.service';

/** The starter's showstopper patterns, as seeded in public.redaction_patterns. */
const rows = [
  {
    id: 'cc',
    name: 'Credit Card - Generic',
    data_type: 'credit_card',
    pattern_regex: '\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b',
    severity: 'showstopper',
    is_active: true,
  },
  {
    id: 'ssn',
    name: 'SSN - US Social Security Number',
    data_type: 'ssn',
    pattern_regex: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    severity: 'showstopper',
    is_active: true,
  },
];

function service(): PIIPatternService {
  const builder = { select: () => builder, eq: async () => ({ data: rows, error: null }) };
  const db = { from: () => builder } as unknown as DatabaseService;
  return new PIIPatternService(db);
}

describe('PIIPatternService false positives', () => {
  it('does not treat the fraction of a model score as a card number', async () => {
    const prompt = JSON.stringify({ editor: 'Brand editor', score: 0.8888888888888888, facets: [{ hook: 0.4444444444444444 }] });
    const result = await service().detectPII(prompt);
    expect(result.matches).toEqual([]);
  });

  it('still finds a real card number, with or without separators', async () => {
    const result = await service().detectPII('Card 4111 1111 1111 1111 and 4242424242424242 on file');
    expect(result.matches.map((m) => [m.dataType, m.severity])).toEqual([
      ['credit_card', 'showstopper'],
      ['credit_card', 'showstopper'],
    ]);
  });

  it('ignores a 16-digit number that fails the card checksum', async () => {
    const result = await service().detectPII('Order reference 1111111111111111');
    expect(result.matches).toEqual([]);
  });

  it('still finds an SSN', async () => {
    const result = await service().detectPII('SSN 123-45-6789');
    expect(result.matches.map((m) => m.dataType)).toEqual(['ssn']);
  });
});

describe('isDecimalFraction / passesLuhn', () => {
  it('recognises only digits right after "<digit>."', () => {
    expect(isDecimalFraction('x 0.8888', 4)).toBe(true);
    expect(isDecimalFraction('end. 8888', 5)).toBe(false);
    expect(isDecimalFraction('8888', 0)).toBe(false);
  });

  it('checks the Luhn digit', () => {
    expect(passesLuhn('4111 1111 1111 1111')).toBe(true);
    expect(passesLuhn('5555-5555-5555-4444')).toBe(true);
    expect(passesLuhn('1111111111111111')).toBe(false);
    expect(passesLuhn('1234')).toBe(false);
  });
});

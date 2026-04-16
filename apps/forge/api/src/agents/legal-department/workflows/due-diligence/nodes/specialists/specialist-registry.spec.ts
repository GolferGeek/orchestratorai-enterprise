import {
  SPECIALISTS,
  getSpecialistConfig,
  containsNumericQuote,
} from './specialist-registry';

describe('Specialist Registry', () => {
  const expectedKeys = [
    'financial-statements',
    'revenue-concentration',
    'working-capital',
    'cap-table',
    'debt-schedule',
  ];

  it('registers all five financial specialists', () => {
    for (const key of expectedKeys) {
      expect(SPECIALISTS[key]).toBeDefined();
    }
    expect(Object.keys(SPECIALISTS)).toHaveLength(expectedKeys.length);
  });

  it.each(expectedKeys)(
    '%s config has required fields and financial category',
    (key) => {
      const cfg = SPECIALISTS[key]!;
      expect(cfg.key).toBe(key);
      expect(cfg.findingCategory).toBe('financial');
      expect(cfg.role.length).toBeGreaterThan(20);
      expect(cfg.focus.length).toBeGreaterThan(20);
      expect(cfg.outputContract).toContain('overallRisk');
      expect(cfg.outputContract).toContain('riskFlags');
      expect(cfg.outputContract).toContain('keyFindings');
      expect(cfg.requireNumericQuote).toBe(true);
    },
  );

  it('cap-table, working-capital, and debt-schedule declare an optional tabular field', () => {
    const tabularSpecialists = [
      'cap-table',
      'working-capital',
      'debt-schedule',
    ];
    for (const key of tabularSpecialists) {
      expect(SPECIALISTS[key]!.outputContract).toContain('tabular');
      expect(SPECIALISTS[key]!.outputContract).toContain('OPTIONAL');
    }
  });

  it('financial-statements and revenue-concentration do NOT declare a tabular field', () => {
    expect(SPECIALISTS['financial-statements']!.outputContract).not.toContain(
      'tabular',
    );
    expect(SPECIALISTS['revenue-concentration']!.outputContract).not.toContain(
      'tabular',
    );
  });

  it('getSpecialistConfig returns the config for registered keys', () => {
    for (const key of expectedKeys) {
      expect(getSpecialistConfig(key)).not.toBeNull();
      expect(getSpecialistConfig(key)!.key).toBe(key);
    }
  });

  it('getSpecialistConfig returns null for legal specialist keys (fall-through to generic template)', () => {
    const legalKeys = [
      'contract',
      'compliance',
      'ip',
      'employment',
      'real_estate',
      'privacy',
      'corporate',
      'litigation',
    ];
    for (const key of legalKeys) {
      expect(getSpecialistConfig(key)).toBeNull();
    }
  });

  describe('containsNumericQuote', () => {
    it('matches dollar signs', () => {
      expect(containsNumericQuote('Revenue $12M')).toBe(true);
    });

    it('matches percent signs', () => {
      expect(containsNumericQuote('Top customer is 42% of revenue')).toBe(true);
    });

    it('matches bare digits', () => {
      expect(containsNumericQuote('DSO increased to 99 days')).toBe(true);
    });

    it('rejects text with no numeric anchors', () => {
      expect(
        containsNumericQuote(
          'The company appears healthy and well-positioned for growth',
        ),
      ).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(containsNumericQuote('')).toBe(false);
    });
  });
});

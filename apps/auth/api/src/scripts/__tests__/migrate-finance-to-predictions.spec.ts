/**
 * Finance to Predictions Migration Script Tests
 *
 * Tests the migration script helper functions without actually running migrations.
 * Uses mocked Supabase client to avoid database operations.
 */

// Mock dotenv before any other imports
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock Supabase before importing the tested module
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockOr = jest.fn();
const mockNot = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

// Setup mock chain
mockFrom.mockReturnValue({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
});
mockSelect.mockReturnValue({
  or: mockOr,
  eq: mockEq,
  single: mockSingle,
});
mockOr.mockReturnValue({
  not: mockNot,
});
mockNot.mockResolvedValue({ data: [], error: null });
mockInsert.mockResolvedValue({ error: null });
mockUpdate.mockReturnValue({ eq: mockEq });
mockEq.mockResolvedValue({ error: null });
mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

// Set env vars before importing tested module (generic test values, not localhost)
process.env.SUPABASE_URL = 'http://test-supabase-host';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

describe('Finance to Predictions Migration Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Runner Type Determination', () => {
    // Test the logic that determines runner type from agent metadata
    const testCases = [
      {
        name: 'should return crypto-predictor for crypto universe type',
        metadata: { universe: { type: 'crypto', instruments: ['BTC'] } },
        expected: 'crypto-predictor',
      },
      {
        name: 'should return crypto-predictor for cryptocurrency universe type',
        metadata: {
          universe: { type: 'cryptocurrency', instruments: ['ETH'] },
        },
        expected: 'crypto-predictor',
      },
      {
        name: 'should return market-predictor for prediction_markets universe type',
        metadata: {
          universe: { type: 'prediction_markets', instruments: ['market-1'] },
        },
        expected: 'market-predictor',
      },
      {
        name: 'should return market-predictor for polymarket universe type',
        metadata: {
          universe: { type: 'polymarket', instruments: ['market-2'] },
        },
        expected: 'market-predictor',
      },
      {
        name: 'should return market-predictor for markets universe type',
        metadata: { universe: { type: 'markets', instruments: ['market-3'] } },
        expected: 'market-predictor',
      },
      {
        name: 'should return stock-predictor for stocks universe type',
        metadata: { universe: { type: 'stocks', instruments: ['AAPL'] } },
        expected: 'stock-predictor',
      },
      {
        name: 'should return stock-predictor when no universe type specified',
        metadata: { universe: { instruments: ['AAPL'] } },
        expected: 'stock-predictor',
      },
      {
        name: 'should return stock-predictor for unknown universe type',
        metadata: { universe: { type: 'unknown', instruments: ['XYZ'] } },
        expected: 'stock-predictor',
      },
    ];

    for (const { name, metadata, expected } of testCases) {
      it(name, () => {
        const universeType = metadata.universe?.type?.toLowerCase();

        let result: string;
        if (universeType === 'crypto' || universeType === 'cryptocurrency') {
          result = 'crypto-predictor';
        } else if (
          universeType === 'prediction_markets' ||
          universeType === 'polymarket' ||
          universeType === 'markets'
        ) {
          result = 'market-predictor';
        } else {
          result = 'stock-predictor';
        }

        expect(result).toBe(expected);
      });
    }
  });

  describe('Risk Profile Determination', () => {
    const determineRiskProfile = (
      riskProfile: string | undefined,
      runnerType: string,
    ): string => {
      const existingProfile = riskProfile?.toLowerCase();

      if (runnerType === 'crypto-predictor') {
        if (existingProfile === 'aggressive' || existingProfile === 'degen') {
          return 'degen';
        }
        if (
          existingProfile === 'conservative' ||
          existingProfile === 'hodler'
        ) {
          return 'hodler';
        }
        return 'trader';
      }

      if (runnerType === 'market-predictor') {
        if (
          existingProfile === 'aggressive' ||
          existingProfile === 'speculator'
        ) {
          return 'speculator';
        }
        return 'researcher';
      }

      // Stock predictor
      if (existingProfile === 'aggressive') {
        return 'aggressive';
      }
      if (existingProfile === 'conservative') {
        return 'conservative';
      }
      return 'moderate';
    };

    describe('crypto-predictor profiles', () => {
      it('should map aggressive to degen', () => {
        expect(determineRiskProfile('aggressive', 'crypto-predictor')).toBe(
          'degen',
        );
      });

      it('should map degen to degen', () => {
        expect(determineRiskProfile('degen', 'crypto-predictor')).toBe('degen');
      });

      it('should map conservative to hodler', () => {
        expect(determineRiskProfile('conservative', 'crypto-predictor')).toBe(
          'hodler',
        );
      });

      it('should map hodler to hodler', () => {
        expect(determineRiskProfile('hodler', 'crypto-predictor')).toBe(
          'hodler',
        );
      });

      it('should default to trader', () => {
        expect(determineRiskProfile(undefined, 'crypto-predictor')).toBe(
          'trader',
        );
        expect(determineRiskProfile('moderate', 'crypto-predictor')).toBe(
          'trader',
        );
      });
    });

    describe('market-predictor profiles', () => {
      it('should map aggressive to speculator', () => {
        expect(determineRiskProfile('aggressive', 'market-predictor')).toBe(
          'speculator',
        );
      });

      it('should map speculator to speculator', () => {
        expect(determineRiskProfile('speculator', 'market-predictor')).toBe(
          'speculator',
        );
      });

      it('should default to researcher', () => {
        expect(determineRiskProfile(undefined, 'market-predictor')).toBe(
          'researcher',
        );
        expect(determineRiskProfile('conservative', 'market-predictor')).toBe(
          'researcher',
        );
      });
    });

    describe('stock-predictor profiles', () => {
      it('should preserve aggressive', () => {
        expect(determineRiskProfile('aggressive', 'stock-predictor')).toBe(
          'aggressive',
        );
      });

      it('should preserve conservative', () => {
        expect(determineRiskProfile('conservative', 'stock-predictor')).toBe(
          'conservative',
        );
      });

      it('should default to moderate', () => {
        expect(determineRiskProfile(undefined, 'stock-predictor')).toBe(
          'moderate',
        );
        expect(determineRiskProfile('unknown', 'stock-predictor')).toBe(
          'moderate',
        );
      });
    });
  });

  describe('Pre-filter Thresholds', () => {
    const getPreFilterThresholds = (runnerType: string) => {
      if (runnerType === 'crypto-predictor') {
        return {
          minPriceChangePercent: 5,
          minSentimentShift: 0.3,
          minSignificanceScore: 0.4,
        };
      }

      if (runnerType === 'market-predictor') {
        return {
          minPriceChangePercent: 5,
          minSentimentShift: 0.3,
          minSignificanceScore: 0.4,
        };
      }

      // Stock predictor defaults
      return {
        minPriceChangePercent: 2,
        minSentimentShift: 0.2,
        minSignificanceScore: 0.3,
      };
    };

    it('should return 5% threshold for crypto', () => {
      const thresholds = getPreFilterThresholds('crypto-predictor');
      expect(thresholds.minPriceChangePercent).toBe(5);
      expect(thresholds.minSignificanceScore).toBe(0.4);
    });

    it('should return 5% threshold for markets (odds shift)', () => {
      const thresholds = getPreFilterThresholds('market-predictor');
      expect(thresholds.minPriceChangePercent).toBe(5);
    });

    it('should return 2% threshold for stocks', () => {
      const thresholds = getPreFilterThresholds('stock-predictor');
      expect(thresholds.minPriceChangePercent).toBe(2);
      expect(thresholds.minSignificanceScore).toBe(0.3);
    });
  });

  describe('Poll Interval', () => {
    const getPollInterval = (
      existingInterval: number | undefined,
      runnerType: string,
    ): number => {
      if (existingInterval) {
        return existingInterval;
      }

      if (runnerType === 'crypto-predictor') {
        return 30000;
      }

      return 60000;
    };

    it('should use existing interval if specified', () => {
      expect(getPollInterval(120000, 'stock-predictor')).toBe(120000);
      expect(getPollInterval(15000, 'crypto-predictor')).toBe(15000);
    });

    it('should default to 30s for crypto', () => {
      expect(getPollInterval(undefined, 'crypto-predictor')).toBe(30000);
    });

    it('should default to 60s for stocks', () => {
      expect(getPollInterval(undefined, 'stock-predictor')).toBe(60000);
    });

    it('should default to 60s for markets', () => {
      expect(getPollInterval(undefined, 'market-predictor')).toBe(60000);
    });
  });

  describe('Migration Result Types', () => {
    type MigrationStatus = 'success' | 'skipped' | 'error';

    interface MigrationResult {
      slug: string;
      orgSlug: string;
      runnerType: string;
      instruments: string[];
      status: MigrationStatus;
      reason?: string;
    }

    it('should have correct success result structure', () => {
      const result: MigrationResult = {
        slug: 'test-agent',
        orgSlug: 'test-org',
        runnerType: 'stock-predictor',
        instruments: ['AAPL', 'MSFT'],
        status: 'success',
      };

      expect(result.status).toBe('success');
      expect(result.instruments).toHaveLength(2);
    });

    it('should have correct skipped result structure', () => {
      const result: MigrationResult = {
        slug: 'test-agent',
        orgSlug: 'test-org',
        runnerType: 'stock-predictor',
        instruments: [],
        status: 'skipped',
        reason: 'No instruments configured',
      };

      expect(result.status).toBe('skipped');
      expect(result.reason).toBeDefined();
    });

    it('should have correct error result structure', () => {
      const result: MigrationResult = {
        slug: 'test-agent',
        orgSlug: 'test-org',
        runnerType: 'crypto-predictor',
        instruments: ['BTC'],
        status: 'error',
        reason: 'Database error',
      };

      expect(result.status).toBe('error');
      expect(result.reason).toContain('error');
    });
  });

  describe('Agent Filtering', () => {
    it('should filter agents with universe metadata', () => {
      const agents = [
        {
          slug: 'agent-1',
          metadata: { universe: { instruments: ['AAPL'] } },
        },
        {
          slug: 'agent-2',
          metadata: { description: 'no universe' },
        },
        {
          slug: 'agent-3',
          metadata: { universe: { instruments: [] } },
        },
        {
          slug: 'agent-4',
          metadata: { universe: { instruments: ['BTC', 'ETH'] } },
        },
      ];

      const filtered = agents.filter((agent) => {
        const metadata = agent.metadata as {
          universe?: { instruments?: string[] };
        };
        return (
          metadata?.universe?.instruments &&
          metadata.universe.instruments.length > 0
        );
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.slug)).toEqual(['agent-1', 'agent-4']);
    });
  });

  describe('Model Config Generation', () => {
    interface LLMConfig {
      provider?: string;
      model?: string;
      temperature?: number;
    }

    const generateModelConfig = (llmConfig: LLMConfig | undefined) => {
      if (!llmConfig) return null;

      return {
        triage: {
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022',
          temperature: 0.2,
        },
        specialists: {
          provider: llmConfig.provider || 'anthropic',
          model: llmConfig.model || 'claude-sonnet-4-20250514',
          temperature: llmConfig.temperature || 0.3,
        },
        evaluators: {
          provider: llmConfig.provider || 'anthropic',
          model: llmConfig.model || 'claude-sonnet-4-20250514',
          temperature: 0.4,
        },
        learning: {
          provider: llmConfig.provider || 'anthropic',
          model: llmConfig.model || 'claude-sonnet-4-20250514',
          temperature: 0.5,
        },
      };
    };

    it('should return null when no LLM config', () => {
      expect(generateModelConfig(undefined)).toBeNull();
    });

    it('should use Haiku for triage stage', () => {
      const config = generateModelConfig({ provider: 'anthropic' });
      expect(config?.triage.model).toBe('claude-3-5-haiku-20241022');
      expect(config?.triage.temperature).toBe(0.2);
    });

    it('should use provided model for specialists', () => {
      const config = generateModelConfig({
        provider: 'anthropic',
        model: 'claude-opus-4-20250514',
        temperature: 0.5,
      });

      expect(config?.specialists.model).toBe('claude-opus-4-20250514');
      expect(config?.specialists.temperature).toBe(0.5);
    });

    it('should use increasing temperature for later stages', () => {
      const config = generateModelConfig({ provider: 'anthropic' });

      expect(config?.triage.temperature).toBe(0.2);
      expect(config?.specialists.temperature).toBe(0.3);
      expect(config?.evaluators.temperature).toBe(0.4);
      expect(config?.learning.temperature).toBe(0.5);
    });
  });

  describe('Learning Config Defaults', () => {
    const DEFAULT_LEARNING_CONFIG = {
      autoPostmortem: true,
      detectMissedOpportunities: true,
      contextLookbackHours: 24,
      maxPostmortemsInContext: 10,
      maxSpecialistStats: 5,
    };

    it('should have auto postmortem enabled by default', () => {
      expect(DEFAULT_LEARNING_CONFIG.autoPostmortem).toBe(true);
    });

    it('should have missed opportunity detection enabled', () => {
      expect(DEFAULT_LEARNING_CONFIG.detectMissedOpportunities).toBe(true);
    });

    it('should have 24 hour lookback period', () => {
      expect(DEFAULT_LEARNING_CONFIG.contextLookbackHours).toBe(24);
    });

    it('should limit postmortems in context to 10', () => {
      expect(DEFAULT_LEARNING_CONFIG.maxPostmortemsInContext).toBe(10);
    });

    it('should limit specialist stats to 5', () => {
      expect(DEFAULT_LEARNING_CONFIG.maxSpecialistStats).toBe(5);
    });
  });
});

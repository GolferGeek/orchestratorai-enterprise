import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  LlmTierResolverService,
  TierResolutionContext,
} from './llm-tier-resolver.service';
import { DATABASE_SERVICE } from '@/database';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LlmTier } from '../interfaces/llm-tier.interface';
import { LlmConfig } from '../interfaces/universe.interface';

describe('LlmTierResolverService', () => {
  let service: LlmTierResolverService;
  let mockDb: any;

  const mockBaseContext: ExecutionContext = {
    userId: 'user-123',
    conversationId: 'conv-123',
    taskId: 'task-123',
    agentSlug: 'prediction-runner',
    orgSlug: 'test-org',
    agentType: 'api',
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    planId: '00000000-0000-0000-0000-000000000000',
    deliverableId: '00000000-0000-0000-0000-000000000000',
  };

  const mockLlmConfig: LlmConfig = {
    gold: { provider: 'anthropic', model: 'claude-opus-4-20250514' },
    silver: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    bronze: { provider: 'anthropic', model: 'claude-haiku-4-20250514' },
  };

  const mockTierMappings = [
    {
      prediction_tier: 'gold',
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
      model_tier: 'standard',
    },
    {
      prediction_tier: 'silver',
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
      model_tier: 'standard',
    },
    {
      prediction_tier: 'bronze',
      provider: 'google',
      model: 'gemini-2.5-flash-lite',
      model_tier: 'standard',
    },
  ];

  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.DEFAULT_LLM_PROVIDER;
    delete process.env.DEFAULT_LLM_MODEL;

    const mockClient = {
      from: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: mockTierMappings, error: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmTierResolverService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockClient,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'DEFAULT_LLM_PROVIDER')
                return process.env.DEFAULT_LLM_PROVIDER;
              if (key === 'DEFAULT_LLM_MODEL')
                return process.env.DEFAULT_LLM_MODEL;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    module.useLogger(false);

    service = module.get<LlmTierResolverService>(LlmTierResolverService);
    mockDb = module.get(DATABASE_SERVICE);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('resolveTier', () => {
    it('should use target override when available', async () => {
      const context: TierResolutionContext = {
        targetLlmConfig: mockLlmConfig,
      };

      const result = await service.resolveTier('gold', context);

      expect(result.tier).toBe('gold');
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-opus-4-20250514');
    });

    it('should use universe config when no target override', async () => {
      const context: TierResolutionContext = {
        targetLlmConfig: null,
        universeLlmConfig: mockLlmConfig,
      };

      const result = await service.resolveTier('silver', context);

      expect(result.tier).toBe('silver');
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-sonnet-4-20250514');
    });

    it('should use agent config when no universe config', async () => {
      const context: TierResolutionContext = {
        targetLlmConfig: null,
        universeLlmConfig: null,
        agentLlmConfig: mockLlmConfig,
      };

      const result = await service.resolveTier('bronze', context);

      expect(result.tier).toBe('bronze');
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-haiku-4-20250514');
    });

    it('should fall back to default tier mapping when no overrides', async () => {
      const result = await service.resolveTier('gold');

      expect(result.tier).toBe('gold');
      expect(result.provider).toBe('google');
      expect(result.model).toBe('gemini-2.5-flash-lite');
    });

    it('should follow priority hierarchy: target > universe > agent', async () => {
      const context: TierResolutionContext = {
        targetLlmConfig: {
          gold: { provider: 'target-provider', model: 'target-model' },
        },
        universeLlmConfig: {
          gold: { provider: 'universe-provider', model: 'universe-model' },
        },
        agentLlmConfig: {
          gold: { provider: 'agent-provider', model: 'agent-model' },
        },
      };

      const result = await service.resolveTier('gold', context);

      expect(result.provider).toBe('target-provider');
      expect(result.model).toBe('target-model');
    });

    it('should resolve different tiers independently', async () => {
      const context: TierResolutionContext = {
        targetLlmConfig: {
          gold: { provider: 'openai', model: 'gpt-4' },
        },
        universeLlmConfig: {
          silver: { provider: 'anthropic', model: 'claude-3-sonnet' },
        },
      };

      const goldResult = await service.resolveTier('gold', context);
      const silverResult = await service.resolveTier('silver', context);
      const bronzeResult = await service.resolveTier('bronze', context);

      expect(goldResult.provider).toBe('openai');
      expect(silverResult.provider).toBe('anthropic');
      expect(bronzeResult.provider).toBe('google'); // Default
    });
  });

  describe('resolveTier with environment override', () => {
    it('should use environment override for all tiers', async () => {
      process.env.DEFAULT_LLM_PROVIDER = 'ollama';
      process.env.DEFAULT_LLM_MODEL = 'llama3:8b';

      // Need to clear cache and recreate service for env changes
      service.clearCache();

      const goldResult = await service.resolveTier('gold');
      const silverResult = await service.resolveTier('silver');
      const bronzeResult = await service.resolveTier('bronze');

      expect(goldResult.provider).toBe('ollama');
      expect(goldResult.model).toBe('llama3:8b');
      expect(silverResult.provider).toBe('ollama');
      expect(bronzeResult.provider).toBe('ollama');
    });
  });

  describe('createTierExecutionContext', () => {
    it('should create context with analyst tracking', () => {
      const result = service.createTierExecutionContext({
        baseContext: mockBaseContext,
        tier: 'gold',
        analystSlug: 'market-analyst',
      });

      expect(result.agentSlug).toBe('market-analyst');
      expect(result.agentType).toBe('analyst');
      expect(result.userId).toBe('user-123');
      expect(result.conversationId).toBe('conv-123');
    });

    it('should use custom taskId when provided', () => {
      const result = service.createTierExecutionContext({
        baseContext: mockBaseContext,
        tier: 'silver',
        analystSlug: 'tech-analyst',
        taskId: 'custom-task-123',
      });

      expect(result.taskId).toBe('custom-task-123');
    });

    it('should use base taskId when custom not provided', () => {
      const result = service.createTierExecutionContext({
        baseContext: mockBaseContext,
        tier: 'bronze',
        analystSlug: 'crypto-analyst',
      });

      expect(result.taskId).toBe('task-123');
    });
  });

  describe('createTierContext', () => {
    it('should resolve tier and create context in one call', async () => {
      const { context, resolved } = await service.createTierContext(
        mockBaseContext,
        'gold',
        'market-analyst',
      );

      expect(resolved.tier).toBe('gold');
      expect(resolved.provider).toBe('google');
      expect(context.provider).toBe('google');
      expect(context.model).toBe('gemini-2.5-flash-lite');
      expect(context.agentSlug).toBe('market-analyst');
      expect(context.agentType).toBe('analyst');
    });

    it('should apply resolution context when provided', async () => {
      const resolutionContext: TierResolutionContext = {
        targetLlmConfig: mockLlmConfig,
      };

      const { context, resolved } = await service.createTierContext(
        mockBaseContext,
        'gold',
        'market-analyst',
        resolutionContext,
      );

      expect(resolved.provider).toBe('anthropic');
      expect(resolved.model).toBe('claude-opus-4-20250514');
      expect(context.provider).toBe('anthropic');
      expect(context.model).toBe('claude-opus-4-20250514');
    });
  });

  describe('clearCache', () => {
    it('should clear the tier mapping cache', async () => {
      // First call to populate cache
      await service.resolveTier('gold');

      // Clear cache
      service.clearCache();

      // Next call should reload from database
      await service.resolveTier('silver');

      // Verify database was queried again (cache was cleared)
      expect(mockDb.from).toHaveBeenCalled();
    });
  });

  describe('database error handling', () => {
    it('should return defaults when database query fails', async () => {
      const mockClientWithError = {
        from: jest.fn().mockReturnThis(),
        rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };

      Object.assign(mockDb, mockClientWithError);
      service.clearCache();

      const result = await service.resolveTier('gold');

      // Should return default mapping
      expect(result.tier).toBe('gold');
      expect(result.provider).toBeDefined();
      expect(result.model).toBeDefined();
    });
  });

  describe('tier types', () => {
    it.each(['gold', 'silver', 'bronze'] as LlmTier[])(
      'should resolve %s tier',
      async (tier) => {
        const result = await service.resolveTier(tier);

        expect(result.tier).toBe(tier);
        expect(result.provider).toBeDefined();
        expect(result.model).toBeDefined();
      },
    );
  });
});

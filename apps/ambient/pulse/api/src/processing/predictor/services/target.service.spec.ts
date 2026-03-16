import { Test, TestingModule } from '@nestjs/testing';
import { TargetService } from './target.service';
import { TargetRepository } from '../repositories/target.repository';
import { UniverseRepository } from '../repositories/universe.repository';
import { Target } from '../interfaces/target.interface';
import { Universe, LlmConfig } from '../interfaces/universe.interface';

describe('TargetService', () => {
  let service: TargetService;
  let targetRepository: jest.Mocked<TargetRepository>;
  let universeRepository: jest.Mocked<UniverseRepository>;

  const mockTarget: Target = {
    id: 'target-123',
    universe_id: 'universe-456',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    target_type: 'stock',
    context: 'Technology company',
    metadata: { sector: 'tech' },
    llm_config_override: null,
    is_active: true,
    is_archived: false,
    current_price: 150.0,
    price_updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockUniverse: Universe = {
    id: 'universe-456',
    organization_slug: 'test-org',
    agent_slug: 'prediction-runner',
    name: 'Tech Stocks',
    description: 'Technology sector stocks',
    domain: 'stocks',
    strategy_id: null,
    llm_config: {
      gold: { provider: 'anthropic', model: 'claude-opus-4-20250514' },
      silver: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      bronze: { provider: 'anthropic', model: 'claude-haiku-4-20250514' },
    },
    thresholds: null,
    notification_config: {
      urgent_enabled: true,
      new_prediction_enabled: true,
      outcome_enabled: true,
      channels: ['push', 'sse'],
    },
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetService,
        {
          provide: TargetRepository,
          useValue: {
            findById: jest.fn(),
            findByIdOrThrow: jest.fn(),
            findAll: jest.fn(),
            findActiveByUniverse: jest.fn(),
            findBySymbol: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: UniverseRepository,
          useValue: {
            findByIdOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    module.useLogger(false);

    service = module.get<TargetService>(TargetService);
    targetRepository = module.get(TargetRepository);
    universeRepository = module.get(UniverseRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return target when found', async () => {
      targetRepository.findById.mockResolvedValue(mockTarget);

      const result = await service.findById('target-123');

      expect(result).toEqual(mockTarget);
      expect(targetRepository.findById).toHaveBeenCalledWith('target-123');
    });

    it('should return null when target not found', async () => {
      targetRepository.findById.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should return target when found', async () => {
      targetRepository.findByIdOrThrow.mockResolvedValue(mockTarget);

      const result = await service.findByIdOrThrow('target-123');

      expect(result).toEqual(mockTarget);
    });

    it('should propagate error when target not found', async () => {
      targetRepository.findByIdOrThrow.mockRejectedValue(
        new Error('Target not found'),
      );

      await expect(service.findByIdOrThrow('non-existent')).rejects.toThrow(
        'Target not found',
      );
    });
  });

  describe('findByUniverse', () => {
    it('should return all targets for a universe', async () => {
      const targets = [
        mockTarget,
        { ...mockTarget, id: 'target-456', symbol: 'MSFT', name: 'Microsoft' },
      ];
      targetRepository.findAll.mockResolvedValue(targets);

      const result = await service.findByUniverse('universe-456');

      expect(result).toHaveLength(2);
      expect(targetRepository.findAll).toHaveBeenCalledWith('universe-456');
    });

    it('should return empty array when no targets', async () => {
      targetRepository.findAll.mockResolvedValue([]);

      const result = await service.findByUniverse('empty-universe');

      expect(result).toHaveLength(0);
    });
  });

  describe('findActiveByUniverse', () => {
    it('should return only active targets', async () => {
      const activeTargets = [mockTarget];
      targetRepository.findActiveByUniverse.mockResolvedValue(activeTargets);

      const result = await service.findActiveByUniverse('universe-456');

      expect(result).toHaveLength(1);
      expect(result[0]!.is_active).toBe(true);
    });
  });

  describe('findBySymbol', () => {
    it('should return target when found by symbol', async () => {
      targetRepository.findBySymbol.mockResolvedValue(mockTarget);

      const result = await service.findBySymbol('universe-456', 'AAPL');

      expect(result).toEqual(mockTarget);
      expect(targetRepository.findBySymbol).toHaveBeenCalledWith(
        'universe-456',
        'AAPL',
      );
    });

    it('should return null when symbol not found', async () => {
      targetRepository.findBySymbol.mockResolvedValue(null);

      const result = await service.findBySymbol('universe-456', 'INVALID');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new target', async () => {
      const createDto = {
        universe_id: 'universe-456',
        symbol: 'GOOGL',
        name: 'Alphabet Inc.',
        target_type: 'stock' as const,
      };
      const createdTarget = { ...mockTarget, ...createDto, id: 'new-target' };
      targetRepository.create.mockResolvedValue(createdTarget);

      const result = await service.create(createDto);

      expect(result.symbol).toBe('GOOGL');
      expect(targetRepository.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('should update an existing target', async () => {
      const updateDto = { name: 'Apple Computer Inc.' };
      const updatedTarget = { ...mockTarget, ...updateDto };
      targetRepository.update.mockResolvedValue(updatedTarget);

      const result = await service.update('target-123', updateDto);

      expect(result.name).toBe('Apple Computer Inc.');
      expect(targetRepository.update).toHaveBeenCalledWith(
        'target-123',
        updateDto,
      );
    });
  });

  describe('delete', () => {
    it('should delete a target', async () => {
      targetRepository.delete.mockResolvedValue(undefined);

      await service.delete('target-123');

      expect(targetRepository.delete).toHaveBeenCalledWith('target-123');
    });
  });

  describe('getEffectiveLlmConfig', () => {
    it('should return target-specific config when override exists', async () => {
      const targetOverride: LlmConfig = {
        gold: { provider: 'openai', model: 'gpt-4' },
        silver: { provider: 'openai', model: 'gpt-4-turbo' },
        bronze: { provider: 'openai', model: 'gpt-3.5-turbo' },
      };
      const targetWithOverride = {
        ...mockTarget,
        llm_config_override: targetOverride,
      };

      const result = await service.getEffectiveLlmConfig(targetWithOverride);

      expect(result).toEqual(targetOverride);
      expect(universeRepository.findByIdOrThrow).not.toHaveBeenCalled();
    });

    it('should return universe config when no target override', async () => {
      universeRepository.findByIdOrThrow.mockResolvedValue(mockUniverse);

      const result = await service.getEffectiveLlmConfig(mockTarget);

      expect(result).toEqual(mockUniverse.llm_config);
      expect(universeRepository.findByIdOrThrow).toHaveBeenCalledWith(
        mockTarget.universe_id,
      );
    });

    it('should return system defaults when no universe config', async () => {
      const universeWithoutConfig = { ...mockUniverse, llm_config: null };
      universeRepository.findByIdOrThrow.mockResolvedValue(
        universeWithoutConfig,
      );

      const result = await service.getEffectiveLlmConfig(mockTarget);

      expect(result.gold!.provider).toBe('anthropic');
      expect(result.gold!.model).toBe('claude-sonnet-4-20250514');
    });

    it('should use correct config priority hierarchy', async () => {
      // First call: target with override
      const targetOverride: LlmConfig = {
        gold: { provider: 'openai', model: 'gpt-4' },
        silver: { provider: 'openai', model: 'gpt-4-turbo' },
        bronze: { provider: 'openai', model: 'gpt-3.5-turbo' },
      };
      const targetWithOverride = {
        ...mockTarget,
        llm_config_override: targetOverride,
      };

      const result1 = await service.getEffectiveLlmConfig(targetWithOverride);
      expect(result1.gold!.provider).toBe('openai');

      // Second call: target without override, universe has config
      universeRepository.findByIdOrThrow.mockResolvedValue(mockUniverse);
      const result2 = await service.getEffectiveLlmConfig(mockTarget);
      expect(result2.gold!.provider).toBe('anthropic');
      expect(result2.gold!.model).toBe('claude-opus-4-20250514');
    });
  });
});

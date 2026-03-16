import { Test, TestingModule } from '@nestjs/testing';
import { UniverseService } from './universe.service';
import { UniverseRepository } from '../repositories/universe.repository';
import { Universe } from '../interfaces/universe.interface';

describe('UniverseService', () => {
  let service: UniverseService;
  let universeRepository: jest.Mocked<UniverseRepository>;

  const mockUniverse: Universe = {
    id: 'universe-123',
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
        UniverseService,
        {
          provide: UniverseRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            findByIdOrThrow: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findByAgentSlug: jest.fn(),
          },
        },
      ],
    }).compile();

    module.useLogger(false);

    service = module.get<UniverseService>(UniverseService);
    universeRepository = module.get(UniverseRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all universes for an organization', async () => {
      const universes = [
        mockUniverse,
        { ...mockUniverse, id: 'universe-456', name: 'Crypto' },
      ];
      universeRepository.findAll.mockResolvedValue(universes);

      const result = await service.findAll('test-org');

      expect(result).toHaveLength(2);
      expect(universeRepository.findAll).toHaveBeenCalledWith('test-org');
    });

    it('should return empty array when no universes', async () => {
      universeRepository.findAll.mockResolvedValue([]);

      const result = await service.findAll('empty-org');

      expect(result).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('should return universe when found', async () => {
      universeRepository.findById.mockResolvedValue(mockUniverse);

      const result = await service.findById('universe-123');

      expect(result).toEqual(mockUniverse);
      expect(universeRepository.findById).toHaveBeenCalledWith('universe-123');
    });

    it('should return null when universe not found', async () => {
      universeRepository.findById.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should return universe when found', async () => {
      universeRepository.findByIdOrThrow.mockResolvedValue(mockUniverse);

      const result = await service.findByIdOrThrow('universe-123');

      expect(result).toEqual(mockUniverse);
    });

    it('should propagate error when universe not found', async () => {
      universeRepository.findByIdOrThrow.mockRejectedValue(
        new Error('Universe not found'),
      );

      await expect(service.findByIdOrThrow('non-existent')).rejects.toThrow(
        'Universe not found',
      );
    });
  });

  describe('create', () => {
    it('should create a new universe', async () => {
      const createDto = {
        organization_slug: 'test-org',
        agent_slug: 'prediction-runner',
        name: 'New Universe',
        domain: 'crypto' as const,
      };
      const createdUniverse = {
        ...mockUniverse,
        ...createDto,
        id: 'new-universe',
      };
      universeRepository.create.mockResolvedValue(createdUniverse);

      const result = await service.create(createDto);

      expect(result.name).toBe('New Universe');
      expect(result.domain).toBe('crypto');
      expect(universeRepository.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('should update an existing universe', async () => {
      const updateDto = { name: 'Updated Name', is_active: false };
      const updatedUniverse = { ...mockUniverse, ...updateDto };
      universeRepository.update.mockResolvedValue(updatedUniverse);

      const result = await service.update('universe-123', updateDto);

      expect(result.name).toBe('Updated Name');
      expect(result.is_active).toBe(false);
      expect(universeRepository.update).toHaveBeenCalledWith(
        'universe-123',
        updateDto,
      );
    });
  });

  describe('delete', () => {
    it('should delete a universe', async () => {
      universeRepository.delete.mockResolvedValue(undefined);

      await service.delete('universe-123');

      expect(universeRepository.delete).toHaveBeenCalledWith('universe-123');
    });
  });

  describe('findByAgentSlug', () => {
    it('should return universes for an agent', async () => {
      const universes = [mockUniverse];
      universeRepository.findByAgentSlug.mockResolvedValue(universes);

      const result = await service.findByAgentSlug(
        'prediction-runner',
        'test-org',
      );

      expect(result).toHaveLength(1);
      expect(universeRepository.findByAgentSlug).toHaveBeenCalledWith(
        'prediction-runner',
        'test-org',
      );
    });

    it('should return empty array when agent has no universes', async () => {
      universeRepository.findByAgentSlug.mockResolvedValue([]);

      const result = await service.findByAgentSlug('other-agent', 'test-org');

      expect(result).toHaveLength(0);
    });
  });

  describe('findByAgent', () => {
    it('should be an alias for findByAgentSlug', async () => {
      const universes = [mockUniverse];
      universeRepository.findByAgentSlug.mockResolvedValue(universes);

      const result = await service.findByAgent('prediction-runner', 'test-org');

      expect(result).toEqual(universes);
      expect(universeRepository.findByAgentSlug).toHaveBeenCalledWith(
        'prediction-runner',
        'test-org',
      );
    });
  });

  describe('getEffectiveThresholds', () => {
    it('should return default thresholds when universe has no overrides', () => {
      const result = service.getEffectiveThresholds(mockUniverse);

      expect(result.min_predictors).toBe(3);
      expect(result.min_combined_strength).toBe(15);
      expect(result.min_direction_consensus).toBe(0.6);
      expect(result.predictor_ttl_hours).toBe(24);
    });

    it('should merge universe thresholds with defaults', () => {
      const universeWithThresholds: Universe = {
        ...mockUniverse,
        thresholds: {
          min_predictors: 5,
          min_combined_strength: 20,
        },
      };

      const result = service.getEffectiveThresholds(universeWithThresholds);

      expect(result.min_predictors).toBe(5);
      expect(result.min_combined_strength).toBe(20);
      // Defaults preserved for unspecified values
      expect(result.min_direction_consensus).toBe(0.6);
      expect(result.predictor_ttl_hours).toBe(24);
    });

    it('should allow partial threshold overrides', () => {
      const universeWithPartialThresholds: Universe = {
        ...mockUniverse,
        thresholds: {
          predictor_ttl_hours: 48,
        },
      };

      const result = service.getEffectiveThresholds(
        universeWithPartialThresholds,
      );

      expect(result.min_predictors).toBe(3);
      expect(result.predictor_ttl_hours).toBe(48);
    });

    it('should handle null thresholds', () => {
      const universeWithNullThresholds: Universe = {
        ...mockUniverse,
        thresholds: null,
      };

      const result = service.getEffectiveThresholds(universeWithNullThresholds);

      expect(result.min_predictors).toBe(3);
      expect(result.min_combined_strength).toBe(15);
    });
  });
});

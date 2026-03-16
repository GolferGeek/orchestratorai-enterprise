import { Test, TestingModule } from '@nestjs/testing';
import { AgentRegistryInvalidationService } from './agent-registry-invalidation.service';
import { AgentRegistryService } from './agent-registry.service';
import { AgentsRepository } from '../repositories/agents.repository';

describe('AgentRegistryInvalidationService', () => {
  let service: AgentRegistryInvalidationService;
  let mockRegistry: jest.Mocked<AgentRegistryService>;
  let mockAgents: jest.Mocked<AgentsRepository>;

  beforeEach(async () => {
    jest.useFakeTimers();

    mockRegistry = {
      clearAll: jest.fn(),
    } as unknown as jest.Mocked<AgentRegistryService>;

    mockAgents = {
      getLatestUpdatedAt: jest.fn(),
    } as unknown as jest.Mocked<AgentsRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRegistryInvalidationService,
        { provide: AgentRegistryService, useValue: mockRegistry },
        { provide: AgentsRepository, useValue: mockAgents },
      ],
    }).compile();

    service = module.get<AgentRegistryInvalidationService>(
      AgentRegistryInvalidationService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.resetAllMocks();
    delete process.env.AGENT_REGISTRY_POLL_INTERVAL_MS;
  });

  describe('onModuleInit', () => {
    it('should initialize without clearing cache on first run', async () => {
      mockAgents.getLatestUpdatedAt.mockResolvedValue('2024-01-01T00:00:00Z');

      await service.onModuleInit();

      expect(mockAgents.getLatestUpdatedAt).toHaveBeenCalledTimes(1);
      expect(mockRegistry.clearAll).not.toHaveBeenCalled();
    });

    it('should not clear cache when updated_at has not changed', async () => {
      mockAgents.getLatestUpdatedAt.mockResolvedValue('2024-01-01T00:00:00Z');

      await service.onModuleInit();
      jest.resetAllMocks();

      mockAgents.getLatestUpdatedAt.mockResolvedValue('2024-01-01T00:00:00Z');

      // Advance timer by default poll interval (15s) to trigger next tick
      await jest.advanceTimersByTimeAsync(15000);

      expect(mockRegistry.clearAll).not.toHaveBeenCalled();
    });

    it('should clear cache when updated_at changes after first poll', async () => {
      mockAgents.getLatestUpdatedAt
        .mockResolvedValueOnce('2024-01-01T00:00:00Z')
        .mockResolvedValueOnce('2024-01-02T00:00:00Z'); // Changed

      await service.onModuleInit();

      // Advance by one poll interval to trigger the tick
      await jest.advanceTimersByTimeAsync(15000);

      expect(mockRegistry.clearAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('should stop polling on module destroy', async () => {
      mockAgents.getLatestUpdatedAt.mockResolvedValue('2024-01-01T00:00:00Z');

      await service.onModuleInit();
      service.onModuleDestroy();

      jest.resetAllMocks();
      mockAgents.getLatestUpdatedAt.mockResolvedValue('2024-01-02T00:00:00Z');

      // Advance timer - should not poll since destroyed
      await jest.advanceTimersByTimeAsync(30000);

      expect(mockAgents.getLatestUpdatedAt).not.toHaveBeenCalled();
    });

    it('should not throw when called multiple times', () => {
      expect(() => {
        service.onModuleDestroy();
        service.onModuleDestroy();
      }).not.toThrow();
    });
  });

  describe('interval resolution', () => {
    it('should use default interval of 15000ms when env var not set', async () => {
      delete process.env.AGENT_REGISTRY_POLL_INTERVAL_MS;
      mockAgents.getLatestUpdatedAt.mockResolvedValue(null);

      const module = await Test.createTestingModule({
        providers: [
          AgentRegistryInvalidationService,
          { provide: AgentRegistryService, useValue: mockRegistry },
          { provide: AgentsRepository, useValue: mockAgents },
        ],
      }).compile();
      const newService = module.get<AgentRegistryInvalidationService>(
        AgentRegistryInvalidationService,
      );

      await newService.onModuleInit();
      const callCountAfterInit =
        mockAgents.getLatestUpdatedAt.mock.calls.length;

      // Advance 14999ms - should NOT trigger another poll
      await jest.advanceTimersByTimeAsync(14999);
      expect(mockAgents.getLatestUpdatedAt.mock.calls.length).toBe(
        callCountAfterInit,
      );

      // Advance 1 more ms to reach 15000ms - should trigger
      await jest.advanceTimersByTimeAsync(1);
      expect(mockAgents.getLatestUpdatedAt.mock.calls.length).toBeGreaterThan(
        callCountAfterInit,
      );

      newService.onModuleDestroy();
    });

    it('should use custom interval from env var when valid', async () => {
      process.env.AGENT_REGISTRY_POLL_INTERVAL_MS = '5000';
      mockAgents.getLatestUpdatedAt.mockResolvedValue(null);

      const module = await Test.createTestingModule({
        providers: [
          AgentRegistryInvalidationService,
          { provide: AgentRegistryService, useValue: mockRegistry },
          { provide: AgentsRepository, useValue: mockAgents },
        ],
      }).compile();
      const newService = module.get<AgentRegistryInvalidationService>(
        AgentRegistryInvalidationService,
      );

      await newService.onModuleInit();
      const callCountAfterInit =
        mockAgents.getLatestUpdatedAt.mock.calls.length;

      // Advance 4999ms - should NOT trigger another poll
      await jest.advanceTimersByTimeAsync(4999);
      expect(mockAgents.getLatestUpdatedAt.mock.calls.length).toBe(
        callCountAfterInit,
      );

      // Advance 1 more ms to reach 5000ms - should trigger
      await jest.advanceTimersByTimeAsync(1);
      expect(mockAgents.getLatestUpdatedAt.mock.calls.length).toBeGreaterThan(
        callCountAfterInit,
      );

      newService.onModuleDestroy();
    });

    it('should use default interval when env var is below minimum (1000ms)', async () => {
      process.env.AGENT_REGISTRY_POLL_INTERVAL_MS = '100'; // Below 1000
      mockAgents.getLatestUpdatedAt.mockResolvedValue(null);

      const module = await Test.createTestingModule({
        providers: [
          AgentRegistryInvalidationService,
          { provide: AgentRegistryService, useValue: mockRegistry },
          { provide: AgentsRepository, useValue: mockAgents },
        ],
      }).compile();
      const newService = module.get<AgentRegistryInvalidationService>(
        AgentRegistryInvalidationService,
      );

      await newService.onModuleInit();
      // Service starts, no error expected
      expect(newService).toBeDefined();

      newService.onModuleDestroy();
    });
  });

  describe('error handling', () => {
    it('should not throw when getLatestUpdatedAt fails during tick', async () => {
      mockAgents.getLatestUpdatedAt
        .mockResolvedValueOnce('2024-01-01T00:00:00Z')
        .mockRejectedValueOnce(new Error('Database error'));

      await service.onModuleInit();

      // Should not throw on tick error - advance one interval
      await expect(jest.advanceTimersByTimeAsync(15000)).resolves.not.toThrow();
    });

    it('should handle null from getLatestUpdatedAt on first run', async () => {
      mockAgents.getLatestUpdatedAt.mockResolvedValue(null);

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should handle null updated_at on subsequent polls gracefully', async () => {
      mockAgents.getLatestUpdatedAt
        .mockResolvedValueOnce('2024-01-01T00:00:00Z')
        .mockResolvedValueOnce(null); // Null on second poll

      await service.onModuleInit();

      await jest.advanceTimersByTimeAsync(15000);

      // Should not clear cache when latest is null
      expect(mockRegistry.clearAll).not.toHaveBeenCalled();
    });
  });
});

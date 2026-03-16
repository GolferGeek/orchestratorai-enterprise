import { Test, TestingModule } from '@nestjs/testing';
import {
  AgentRegistryService,
  AgentDefinition,
} from './agent-registry.service';
import { ProductClientService } from '../common/product-client.service';

const mockProductClient = {
  forgeGet: jest.fn(),
  composeGet: jest.fn(),
  forgePut: jest.fn(),
  composePut: jest.fn(),
};

const makeAgent = (slug: string, product: string): AgentDefinition => ({
  slug,
  name: `${slug} agent`,
  description: 'Test agent',
  agentType: 'context',
  product,
  orgSlug: 'org-a',
  config: {},
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

describe('AgentRegistryService', () => {
  let service: AgentRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRegistryService,
        { provide: ProductClientService, useValue: mockProductClient },
      ],
    }).compile();

    service = module.get<AgentRegistryService>(AgentRegistryService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listAgents', () => {
    it('should aggregate agents from Forge and Compose', async () => {
      const forgeAgents = [makeAgent('forge-agent', 'forge')];
      const composeAgents = [makeAgent('compose-agent', 'compose')];

      mockProductClient.forgeGet.mockResolvedValueOnce(forgeAgents);
      mockProductClient.composeGet.mockResolvedValueOnce(composeAgents);

      const result = await service.listAgents();

      expect(result.agents).toHaveLength(2);
      expect(result.sources).toEqual(['forge', 'compose']);
    });

    it('should propagate errors when Forge is unavailable', async () => {
      mockProductClient.forgeGet.mockRejectedValueOnce(new Error('Forge down'));

      await expect(service.listAgents()).rejects.toThrow('Forge down');
    });
  });

  describe('getAgent', () => {
    it('should return agent from Forge when found there', async () => {
      const agent = makeAgent('my-agent', 'forge');
      mockProductClient.forgeGet.mockResolvedValueOnce(agent);
      mockProductClient.composeGet.mockRejectedValueOnce(
        new Error('Not found in Compose'),
      );

      const result = await service.getAgent('my-agent');

      expect(result.agent.slug).toBe('my-agent');
      expect(result.source).toBe('forge');
    });

    it('should fall back to Compose when Forge does not have the agent', async () => {
      const agent = makeAgent('compose-only-agent', 'compose');
      mockProductClient.forgeGet.mockRejectedValueOnce(
        new Error('Not found in Forge'),
      );
      mockProductClient.composeGet.mockResolvedValueOnce(agent);

      const result = await service.getAgent('compose-only-agent');

      expect(result.agent.slug).toBe('compose-only-agent');
      expect(result.source).toBe('compose');
    });

    it('should throw when agent is not found in either product', async () => {
      mockProductClient.forgeGet.mockRejectedValueOnce(
        new Error('Not found in Forge'),
      );
      mockProductClient.composeGet.mockRejectedValueOnce(
        new Error('Not found in Compose'),
      );

      await expect(service.getAgent('missing-agent')).rejects.toThrow(
        'Not found in Forge',
      );
    });
  });

  describe('updateAgentConfig', () => {
    it('should update via Forge when agent is in Forge', async () => {
      const updated = makeAgent('my-agent', 'forge');
      mockProductClient.forgePut.mockResolvedValueOnce(updated);
      mockProductClient.composePut.mockRejectedValueOnce(
        new Error('Not in Compose'),
      );

      const result = await service.updateAgentConfig('my-agent', {
        config: { key: 'value' },
      });

      expect(result.product).toBe('forge');
    });

    it('should throw when neither product accepts the update', async () => {
      mockProductClient.forgePut.mockRejectedValueOnce(
        new Error('Forge error'),
      );
      mockProductClient.composePut.mockRejectedValueOnce(
        new Error('Compose error'),
      );

      await expect(
        service.updateAgentConfig('ghost-agent', { config: {} }),
      ).rejects.toThrow('Forge error');
    });
  });

  describe('getStats', () => {
    it('should aggregate stats from Forge and Compose', async () => {
      const forgeStats = [
        {
          slug: 'a',
          product: 'forge',
          totalTasks: 10,
          successfulTasks: 9,
          failedTasks: 1,
          averageDurationMs: 500,
          lastRunAt: null,
        },
      ];
      const composeStats = [
        {
          slug: 'b',
          product: 'compose',
          totalTasks: 5,
          successfulTasks: 5,
          failedTasks: 0,
          averageDurationMs: 200,
          lastRunAt: null,
        },
      ];

      mockProductClient.forgeGet.mockResolvedValueOnce(forgeStats);
      mockProductClient.composeGet.mockResolvedValueOnce(composeStats);

      const result = await service.getStats();

      expect(result.stats).toHaveLength(2);
      expect(result.sources).toEqual(['forge', 'compose']);
    });
  });
});

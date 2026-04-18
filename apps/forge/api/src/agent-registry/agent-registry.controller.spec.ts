import { Test, TestingModule } from '@nestjs/testing';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';
import { NotFoundException } from '@nestjs/common';
import {
  applyRemoteAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';

describe('AgentRegistryController', () => {
  let controller: AgentRegistryController;
  let service: jest.Mocked<AgentRegistryService>;

  const mockAgents = [
    {
      id: 'legal-department',
      name: 'legal-department',
      slug: 'legal-department',
      description: 'Legal Department AI',
      type: 'api',
      organizationSlug: 'demo-org',
      requireLocalModel: false,
      llm_config: null,
      hasCustomUI: true,
      customUIComponent: 'LegalDepartmentView',
      metadata: {},
      execution_modes: null,
      execution_profile: null,
      io_schema: null,
    },
  ];

  const mockConversation = {
    id: 'conv-123',
    agentName: 'legal-department',
    agentType: 'api',
    organizationSlug: 'demo-org',
    conversationId: 'conv-123',
    createdAt: '2026-03-17T00:00:00.000Z',
    updatedAt: '2026-03-17T00:00:00.000Z',
    metadata: {},
  };

  beforeEach(async () => {
    resetAuthMocks();
    const mockService = {
      getAvailableAgents: jest.fn().mockResolvedValue({ agents: mockAgents }),
      createConversation: jest.fn().mockResolvedValue(mockConversation),
      getConversation: jest.fn().mockResolvedValue(mockConversation),
      listConversations: jest.fn().mockResolvedValue([mockConversation]),
    };

    const module: TestingModule = await applyAuthOverrides(
      Test.createTestingModule({
        controllers: [AgentRegistryController],
        providers: [{ provide: AgentRegistryService, useValue: mockService }],
      }),
    ).compile();

    controller = module.get<AgentRegistryController>(AgentRegistryController);
    service = module.get(AgentRegistryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /agents', () => {
    it('should return all agents', async () => {
      const result = await controller.getAgents();
      expect(result).toEqual({ agents: mockAgents });
      expect(service.getAvailableAgents).toHaveBeenCalledWith(undefined);
    });

    it('should filter by organization slug header', async () => {
      await controller.getAgents('demo-org');
      expect(service.getAvailableAgents).toHaveBeenCalledWith('demo-org');
    });
  });

  describe('POST /agent-conversations', () => {
    it('should create a conversation', async () => {
      const body = {
        agentName: 'legal-department',
        agentType: 'api',
        organizationSlug: 'demo-org',
        conversationId: 'conv-123',
      };
      const result = await controller.createConversation(body);
      expect(result).toEqual(mockConversation);
      expect(service.createConversation).toHaveBeenCalledWith(body);
    });
  });

  describe('GET /agent-conversations/:conversationId', () => {
    it('should return a conversation', async () => {
      const result = await controller.getConversation('conv-123');
      expect(result).toEqual(mockConversation);
    });

    it('should throw NotFoundException for missing conversation', async () => {
      service.getConversation.mockResolvedValueOnce(null);
      await expect(controller.getConversation('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GET /agent-conversations', () => {
    it('should list conversations', async () => {
      const result = await controller.listConversations(
        'legal-department',
        'demo-org',
      );
      expect(result).toEqual([mockConversation]);
      expect(service.listConversations).toHaveBeenCalledWith(
        'legal-department',
        'demo-org',
      );
    });
  });

  describe('GET /agents/:slug/presentation', () => {
    it('returns the manifest for legal-department', () => {
      const result = controller.getAgentPresentation('legal-department');
      expect(result.agentSlug).toBe('legal-department');
      expect(result.stages.length).toBeGreaterThan(0);
      // Check that the conditional specialist stages are declared
      const conditionalIds = result.stages
        .filter((s) => s.conditional)
        .map((s) => s.id);
      expect(conditionalIds).toEqual(
        expect.arrayContaining([
          'contract',
          'compliance',
          'corporate',
          'employment',
          'ip',
          'litigation',
          'privacy',
          'real_estate',
        ]),
      );
      // Suppress rules hide LLM lifecycle noise
      expect(result.suppress).toBeDefined();
      expect(
        result.suppress?.some((r) => r.hookEventType === 'agent.llm.started'),
      ).toBe(true);
      // Activator references the CLO routing event
      expect(result.activators).toBeDefined();
      expect(
        result.activators?.some((a) => a.match.step === 'clo_routing_complete'),
      ).toBe(true);
      // Rules cover the metadata, classify, synthesize, and report stages
      const ruleStages = new Set(result.rules.map((r) => r.stage));
      for (const expected of ['metadata', 'classify', 'synthesize', 'report']) {
        expect(ruleStages.has(expected)).toBe(true);
      }
    });

    it('throws NotFoundException for an unknown agent slug', () => {
      expect(() => controller.getAgentPresentation('not-a-real-agent')).toThrow(
        NotFoundException,
      );
    });
  });
});

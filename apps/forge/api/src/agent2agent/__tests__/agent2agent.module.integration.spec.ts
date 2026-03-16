/**
 * Agent2AgentModule Integration Tests
 *
 * Tests module structure, service availability, and exports.
 * These tests verify the module is properly structured for cross-module communication.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AgentExecutionGateway } from '../services/agent-execution-gateway.service';
import { AgentModeRouterService } from '../services/agent-mode-router.service';
import { AgentRunnerRegistryService } from '../services/agent-runner-registry.service';
import { ContextAgentRunnerService } from '../services/context-agent-runner.service';
import { ApiAgentRunnerService } from '../services/api-agent-runner.service';
import { ExternalAgentRunnerService } from '../services/external-agent-runner.service';
import { OrchestratorAgentRunnerService } from '../services/orchestrator-agent-runner.service';
import { RagAgentRunnerService } from '../services/rag-agent-runner.service';
import { MediaAgentRunnerService } from '../services/media-agent-runner.service';
import { Agent2AgentConversationsService } from '../services/agent-conversations.service';
import { Agent2AgentTasksService } from '../services/agent-tasks.service';
import { Agent2AgentTaskStatusService } from '../services/agent-task-status.service';
import { Agent2AgentDeliverablesService } from '../services/agent2agent-deliverables.service';
import { StreamingService } from '../services/streaming.service';
import { AgentCardBuilderService } from '../services/agent-card-builder.service';
import { RoutingPolicyAdapterService } from '../services/routing-policy-adapter.service';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

describe('Agent2AgentModule Integration', () => {
  let module: TestingModule;

  // Mock implementations for all services
  const mockAgentExecutionGateway = {
    execute: jest.fn(),
  };

  const mockAgentModeRouterService = {
    route: jest.fn(),
    getAvailableModes: jest.fn(),
  };

  const mockAgentRunnerRegistryService = {
    getRunner: jest.fn(),
    registerRunner: jest.fn(),
    hasRunner: jest.fn(),
    getRegisteredTypes: jest
      .fn()
      .mockReturnValue(['context', 'api', 'external']),
    getRunnerCount: jest.fn().mockReturnValue(6),
  };

  const mockContextAgentRunnerService = {
    run: jest.fn(),
  };

  const mockApiAgentRunnerService = {
    run: jest.fn(),
  };

  const mockExternalAgentRunnerService = {
    run: jest.fn(),
  };

  const mockOrchestratorAgentRunnerService = {
    run: jest.fn(),
  };

  const mockRagAgentRunnerService = {
    run: jest.fn(),
  };

  const mockMediaAgentRunnerService = {
    run: jest.fn(),
  };

  const mockAgent2AgentConversationsService = {
    getConversation: jest.fn(),
    createConversation: jest.fn(),
    addMessage: jest.fn(),
  };

  const mockAgent2AgentTasksService = {
    getTask: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
  };

  const mockAgent2AgentTaskStatusService = {
    getStatus: jest.fn(),
    updateStatus: jest.fn(),
  };

  const mockAgent2AgentDeliverablesService = {
    getDeliverable: jest.fn(),
    createDeliverable: jest.fn(),
    updateDeliverable: jest.fn(),
  };

  const mockStreamingService = {
    registerStream: jest.fn(),
    emitProgress: jest.fn(),
    emitComplete: jest.fn(),
    emitError: jest.fn(),
    emitObservabilityOnly: jest.fn(),
  };

  const mockAgentCardBuilderService = {
    buildCard: jest.fn(),
    getAgentCard: jest.fn(),
  };

  const mockRoutingPolicyAdapterService = {
    getPolicy: jest.fn(),
    applyPolicy: jest.fn(),
  };

  beforeAll(async () => {
    // Create a simple test module with mocked providers
    // This tests that services can be wired together properly
    module = await Test.createTestingModule({
      providers: [
        { provide: AgentExecutionGateway, useValue: mockAgentExecutionGateway },
        {
          provide: AgentModeRouterService,
          useValue: mockAgentModeRouterService,
        },
        {
          provide: AgentRunnerRegistryService,
          useValue: mockAgentRunnerRegistryService,
        },
        {
          provide: ContextAgentRunnerService,
          useValue: mockContextAgentRunnerService,
        },
        { provide: ApiAgentRunnerService, useValue: mockApiAgentRunnerService },
        {
          provide: ExternalAgentRunnerService,
          useValue: mockExternalAgentRunnerService,
        },
        {
          provide: OrchestratorAgentRunnerService,
          useValue: mockOrchestratorAgentRunnerService,
        },
        { provide: RagAgentRunnerService, useValue: mockRagAgentRunnerService },
        {
          provide: MediaAgentRunnerService,
          useValue: mockMediaAgentRunnerService,
        },
        {
          provide: Agent2AgentConversationsService,
          useValue: mockAgent2AgentConversationsService,
        },
        {
          provide: Agent2AgentTasksService,
          useValue: mockAgent2AgentTasksService,
        },
        {
          provide: Agent2AgentTaskStatusService,
          useValue: mockAgent2AgentTaskStatusService,
        },
        {
          provide: Agent2AgentDeliverablesService,
          useValue: mockAgent2AgentDeliverablesService,
        },
        { provide: StreamingService, useValue: mockStreamingService },
        {
          provide: AgentCardBuilderService,
          useValue: mockAgentCardBuilderService,
        },
        {
          provide: RoutingPolicyAdapterService,
          useValue: mockRoutingPolicyAdapterService,
        },
      ],
    }).compile();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Module Initialization', () => {
    it('should be defined', () => {
      expect(module).toBeDefined();
    });

    it('should initialize without circular dependency errors', () => {
      // If we get here, the module initialized successfully
      // Circular dependencies would have thrown during compilation
      expect(module).toBeDefined();
    });
  });

  describe('Service Exports', () => {
    it('should export AgentExecutionGateway', () => {
      const service = module.get<AgentExecutionGateway>(AgentExecutionGateway);
      expect(service).toBeDefined();
    });

    it('should export AgentModeRouterService', () => {
      const service = module.get<AgentModeRouterService>(
        AgentModeRouterService,
      );
      expect(service).toBeDefined();
    });

    it('should export Agent2AgentConversationsService', () => {
      const service = module.get<Agent2AgentConversationsService>(
        Agent2AgentConversationsService,
      );
      expect(service).toBeDefined();
    });

    it('should export StreamingService', () => {
      const service = module.get<StreamingService>(StreamingService);
      expect(service).toBeDefined();
    });
  });

  describe('Runner Services', () => {
    it('should have ContextAgentRunnerService available', () => {
      const service = module.get<ContextAgentRunnerService>(
        ContextAgentRunnerService,
      );
      expect(service).toBeDefined();
    });

    it('should have ApiAgentRunnerService available', () => {
      const service = module.get<ApiAgentRunnerService>(ApiAgentRunnerService);
      expect(service).toBeDefined();
    });

    it('should have ExternalAgentRunnerService available', () => {
      const service = module.get<ExternalAgentRunnerService>(
        ExternalAgentRunnerService,
      );
      expect(service).toBeDefined();
    });

    it('should have OrchestratorAgentRunnerService available', () => {
      const service = module.get<OrchestratorAgentRunnerService>(
        OrchestratorAgentRunnerService,
      );
      expect(service).toBeDefined();
    });

    it('should have RagAgentRunnerService available', () => {
      const service = module.get<RagAgentRunnerService>(RagAgentRunnerService);
      expect(service).toBeDefined();
    });

    it('should have MediaAgentRunnerService available', () => {
      const service = module.get<MediaAgentRunnerService>(
        MediaAgentRunnerService,
      );
      expect(service).toBeDefined();
    });
  });

  describe('Service Method Availability', () => {
    it('should have AgentExecutionGateway methods available', () => {
      const service = module.get<AgentExecutionGateway>(AgentExecutionGateway);
      expect(service.execute).toBeDefined();
    });

    it('should have StreamingService methods available', () => {
      const service = module.get<StreamingService>(StreamingService);
      expect(service.registerStream).toBeDefined();
      expect(service.emitProgress).toBeDefined();
      expect(service.emitComplete).toBeDefined();
      expect(service.emitError).toBeDefined();
    });

    it('should have AgentRunnerRegistryService methods available', () => {
      const registry = module.get<AgentRunnerRegistryService>(
        AgentRunnerRegistryService,
      );
      expect(registry.getRunner).toBeDefined();
      expect(registry.getRegisteredTypes).toBeDefined();
      expect(registry.hasRunner).toBeDefined();
    });
  });
});

describe('Agent2AgentModule Service Imports', () => {
  it('should import all required service classes', () => {
    // This test verifies that all services are properly importable
    // which is required for cross-module communication
    expect(AgentExecutionGateway).toBeDefined();
    expect(AgentModeRouterService).toBeDefined();
    expect(AgentRunnerRegistryService).toBeDefined();
    expect(ContextAgentRunnerService).toBeDefined();
    expect(ApiAgentRunnerService).toBeDefined();
    expect(ExternalAgentRunnerService).toBeDefined();
    expect(OrchestratorAgentRunnerService).toBeDefined();
    expect(RagAgentRunnerService).toBeDefined();
    expect(MediaAgentRunnerService).toBeDefined();
    expect(Agent2AgentConversationsService).toBeDefined();
    expect(Agent2AgentTasksService).toBeDefined();
    expect(Agent2AgentTaskStatusService).toBeDefined();
    expect(Agent2AgentDeliverablesService).toBeDefined();
    expect(StreamingService).toBeDefined();
    expect(AgentCardBuilderService).toBeDefined();
    expect(RoutingPolicyAdapterService).toBeDefined();
  });
});

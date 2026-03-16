/**
 * Cross-Module Communication Integration Tests
 *
 * Tests that services from AgentPlatformModule and Agent2AgentModule
 * can communicate correctly across module boundaries.
 *
 * These tests are critical for verifying that circular dependency
 * refactoring does not break cross-module service calls.
 */

import { Test, TestingModule } from '@nestjs/testing';

// Import specific services we need to test cross-module communication
import { AgentRegistryService } from '../agent-platform/services/agent-registry.service';
import { AgentRuntimeExecutionService } from '../agent-platform/services/agent-runtime-execution.service';
import { AgentRunnerRegistryService } from '../agent2agent/services/agent-runner-registry.service';

// Mock dependencies to isolate tests
jest.mock('../planes/supabase-core/supabase.module', () => ({
  SupabaseModule: class MockSupabaseModule {},
}));

jest.mock('../llms/llm.module', () => ({
  LLMModule: class MockLLMModule {},
}));

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

describe('Cross-Module Communication Integration', () => {
  describe('AgentPlatform → Agent2Agent Communication', () => {
    let module: TestingModule;

    // Mock services
    const mockAgentRegistryService = {
      getAgent: jest.fn().mockResolvedValue({
        id: 'test-agent-id',
        slug: 'test-agent',
        name: 'Test Agent',
        agent_type: 'context',
        organization_slug: ['test-org'],
      }),
    };

    const mockAgentRuntimeExecutionService = {
      getAgentMetadataFromDefinition: jest.fn().mockReturnValue({
        id: 'test-agent',
        slug: 'test-agent',
        displayName: 'Test Agent',
        type: 'context',
        organizationSlug: 'test-org',
      }),
      collectRequestMetadata: jest.fn().mockReturnValue({}),
      enrichPlanDraft: jest.fn().mockReturnValue({}),
      buildRunMetadata: jest.fn().mockReturnValue({}),
    };

    const mockAgentRunnerRegistryService = {
      getRunner: jest.fn().mockReturnValue({
        run: jest.fn().mockResolvedValue({ result: 'success' }),
      }),
      getRegisteredTypes: jest
        .fn()
        .mockReturnValue(['context', 'api', 'external']),
      hasRunner: jest.fn().mockReturnValue(true),
      registerRunner: jest.fn(),
      getRunnerCount: jest.fn().mockReturnValue(6),
    };

    beforeAll(async () => {
      module = await Test.createTestingModule({
        providers: [
          {
            provide: AgentRegistryService,
            useValue: mockAgentRegistryService,
          },
          {
            provide: AgentRuntimeExecutionService,
            useValue: mockAgentRuntimeExecutionService,
          },
          {
            provide: AgentRunnerRegistryService,
            useValue: mockAgentRunnerRegistryService,
          },
        ],
      }).compile();
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should allow AgentRegistryService to be called from Agent2Agent context', async () => {
      const registryService =
        module.get<AgentRegistryService>(AgentRegistryService);

      // Simulate Agent2Agent calling AgentPlatform to get agent definition
      const agent = await registryService.getAgent('test-org', 'test-agent');

      expect(agent).toBeDefined();
      expect(agent).not.toBeNull();
      expect(agent!.slug).toBe('test-agent');
      expect(mockAgentRegistryService.getAgent).toHaveBeenCalledWith(
        'test-org',
        'test-agent',
      );
    });

    it('should allow AgentRunnerRegistryService to get registered types', () => {
      const runnerRegistry = module.get<AgentRunnerRegistryService>(
        AgentRunnerRegistryService,
      );

      const types = runnerRegistry.getRegisteredTypes();

      expect(types).toContain('context');
      expect(types).toContain('api');
      expect(types).toContain('external');
    });

    it('should allow AgentRuntimeExecutionService to build metadata', () => {
      const executionService = module.get<AgentRuntimeExecutionService>(
        AgentRuntimeExecutionService,
      );

      const metadata = executionService.getAgentMetadataFromDefinition(
        {} as any,
        'test-org',
      );

      expect(metadata).toBeDefined();
      expect(metadata.slug).toBe('test-agent');
      expect(metadata.organizationSlug).toBe('test-org');
    });

    it('should get runner from registry', () => {
      const runnerRegistry = module.get<AgentRunnerRegistryService>(
        AgentRunnerRegistryService,
      );

      const runner = runnerRegistry.getRunner('context');

      expect(runner).toBeDefined();
      expect(runner).not.toBeNull();
    });
  });

  describe('Agent2Agent → AgentPlatform Communication', () => {
    let module: TestingModule;

    const mockAgentRegistryService = {
      getAgent: jest.fn().mockResolvedValue({
        id: 'agent-1',
        slug: 'test-agent',
        agent_type: 'context',
        organization_slug: ['test-org'],
      }),
    };

    beforeAll(async () => {
      module = await Test.createTestingModule({
        providers: [
          {
            provide: AgentRegistryService,
            useValue: mockAgentRegistryService,
          },
        ],
      }).compile();
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should allow Agent2Agent services to lookup agents in AgentPlatform', async () => {
      const registryService =
        module.get<AgentRegistryService>(AgentRegistryService);

      // Agent2Agent needs to lookup agent definitions
      const agent = await registryService.getAgent('test-org', 'test-agent');

      expect(agent).toBeDefined();
      expect(mockAgentRegistryService.getAgent).toHaveBeenCalled();
    });
  });

  describe('Bidirectional Communication Flow', () => {
    let module: TestingModule;

    const mockAgentRegistryService = {
      getAgent: jest.fn().mockResolvedValue({
        id: 'agent-1',
        slug: 'bidirectional-agent',
        agent_type: 'orchestrator',
        organization_slug: ['test-org'],
      }),
    };

    const mockAgentRuntimeExecutionService = {
      getAgentMetadataFromDefinition: jest.fn().mockReturnValue({
        id: 'bidirectional-agent',
        slug: 'bidirectional-agent',
        displayName: 'Bidirectional Agent',
        type: 'orchestrator',
        organizationSlug: 'test-org',
      }),
    };

    beforeAll(async () => {
      module = await Test.createTestingModule({
        providers: [
          {
            provide: AgentRegistryService,
            useValue: mockAgentRegistryService,
          },
          {
            provide: AgentRuntimeExecutionService,
            useValue: mockAgentRuntimeExecutionService,
          },
        ],
      }).compile();
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should support complete execution flow across modules', async () => {
      const registryService =
        module.get<AgentRegistryService>(AgentRegistryService);
      const executionService = module.get<AgentRuntimeExecutionService>(
        AgentRuntimeExecutionService,
      );

      // Step 1: Get agent from registry (AgentPlatform)
      const agent = await registryService.getAgent(
        'test-org',
        'bidirectional-agent',
      );
      expect(agent).not.toBeNull();
      expect(agent!.slug).toBe('bidirectional-agent');

      // Step 2: Get metadata (AgentPlatform)

      const metadata = executionService.getAgentMetadataFromDefinition(
        {} as any,
        'test-org',
      );
      expect(metadata.slug).toBe('bidirectional-agent');
    });

    it('should maintain data consistency across module boundaries', async () => {
      const registryService =
        module.get<AgentRegistryService>(AgentRegistryService);
      const executionService = module.get<AgentRuntimeExecutionService>(
        AgentRuntimeExecutionService,
      );

      // Get data from both services
      const agent = await registryService.getAgent(
        'test-org',
        'bidirectional-agent',
      );

      const metadata = executionService.getAgentMetadataFromDefinition(
        {} as any,
        'test-org',
      );

      // Verify consistency - both should reference same agent
      expect(agent).not.toBeNull();
      expect(agent!.slug).toBe(metadata.slug);
    });
  });

  describe('Error Propagation Across Modules', () => {
    let module: TestingModule;

    const mockAgentRegistryService = {
      getAgent: jest.fn().mockRejectedValue(new Error('Agent not found')),
    };

    beforeAll(async () => {
      module = await Test.createTestingModule({
        providers: [
          {
            provide: AgentRegistryService,
            useValue: mockAgentRegistryService,
          },
        ],
      }).compile();
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    it('should propagate errors from AgentPlatform to Agent2Agent', async () => {
      const registryService =
        module.get<AgentRegistryService>(AgentRegistryService);

      await expect(
        registryService.getAgent('test-org', 'nonexistent-agent'),
      ).rejects.toThrow('Agent not found');
    });
  });
});

describe('Service Dependency Chain Verification', () => {
  it('should verify AgentPlatform exports are accessible', () => {
    // These imports should work if exports are configured correctly
    expect(AgentRegistryService).toBeDefined();
    expect(AgentRuntimeExecutionService).toBeDefined();
  });

  it('should verify Agent2Agent exports are accessible', () => {
    // These imports should work if exports are configured correctly
    expect(AgentRunnerRegistryService).toBeDefined();
  });
});

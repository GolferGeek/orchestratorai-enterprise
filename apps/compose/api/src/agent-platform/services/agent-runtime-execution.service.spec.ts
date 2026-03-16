import { AgentRuntimeExecutionService } from './agent-runtime-execution.service';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';

describe('AgentRuntimeExecutionService', () => {
  let service: AgentRuntimeExecutionService;

  beforeEach(() => {
    service = new AgentRuntimeExecutionService();
  });

  describe('getAgentMetadataFromDefinition', () => {
    it('should extract agent metadata from definition', () => {
      const definition: Partial<AgentRuntimeDefinition> = {
        slug: 'test-agent',
        name: 'Test Agent',
        agentType: 'context',
        organizationSlug: ['test-org'],
      };

      const result = service.getAgentMetadataFromDefinition(
        definition as AgentRuntimeDefinition,
        'test-org',
      );

      expect(result).toEqual({
        id: 'test-agent',
        slug: 'test-agent',
        displayName: 'Test Agent',
        type: 'context',
        organizationSlug: 'test-org',
      });
    });

    it('should handle null values in definition', () => {
      const definition: Partial<AgentRuntimeDefinition> = {
        slug: 'test-agent',
        name: undefined,
        agentType: undefined,
      };

      const result = service.getAgentMetadataFromDefinition(
        definition as AgentRuntimeDefinition,
        null,
      );

      expect(result).toEqual({
        id: 'test-agent',
        slug: 'test-agent',
        displayName: null,
        type: null,
        organizationSlug: null,
      });
    });
  });

  describe('collectRequestMetadata', () => {
    it('should collect metadata from payload', () => {
      const request = {
        payload: {
          metadata: { key1: 'value1', key2: 'value2' },
        },
      };

      const result = service.collectRequestMetadata(request);

      expect(result).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should collect metadata from request metadata', () => {
      const request = {
        metadata: { key3: 'value3' },
      };

      const result = service.collectRequestMetadata(request);

      expect(result).toEqual({ key3: 'value3' });
    });

    it('should merge payload and request metadata with request metadata taking precedence', () => {
      const request = {
        payload: {
          metadata: { key1: 'value1', key2: 'value2' },
        },
        metadata: { key2: 'override', key3: 'value3' },
      };

      const result = service.collectRequestMetadata(request);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'override',
        key3: 'value3',
      });
    });

    it('should return empty object when no metadata present', () => {
      const request = {};

      const result = service.collectRequestMetadata(request);

      expect(result).toEqual({});
    });

    it('should handle non-object metadata gracefully', () => {
      const request = {
        payload: {
          metadata: 'not an object',
        },
        metadata: 123,
      };

      const result = service.collectRequestMetadata(request);

      expect(result).toEqual({});
    });
  });

  describe('enrichPlanDraft', () => {
    it('should add agent metadata to plan draft', () => {
      const draft = {
        phases: ['phase1', 'phase2'],
        description: 'test plan',
      };
      const agent = {
        id: 'agent-1',
        slug: 'test-agent',
        displayName: 'Test Agent',
        type: 'context' as const,
        organizationSlug: 'test-org',
      };

      const result = service.enrichPlanDraft(draft, agent);

      expect(result).toEqual({
        phases: ['phase1', 'phase2'],
        description: 'test plan',
        _meta: {
          agent,
        },
      });
    });

    it('should merge with existing _meta', () => {
      const draft = {
        phases: ['phase1'],
        _meta: {
          existingKey: 'existingValue',
        },
      };
      const agent = {
        id: 'agent-1',
        slug: 'test-agent',
        displayName: 'Test Agent',
        type: 'context' as const,
        organizationSlug: 'test-org',
      };

      const result = service.enrichPlanDraft(draft, agent);

      expect(result._meta).toEqual({
        existingKey: 'existingValue',
        agent,
      });
    });

    it('should handle non-object draft', () => {
      const draft = null;
      const agent = {
        id: 'agent-1',
        slug: 'test-agent',
        displayName: null,
        type: null,
        organizationSlug: null,
      };

      const result = service.enrichPlanDraft(draft, agent);

      expect(result).toEqual({
        _meta: {
          agent,
        },
      });
    });
  });

  describe('buildRunMetadata', () => {
    it('should build run metadata with agent details', () => {
      const base = {
        requestId: 'req-1',
        timestamp: '2023-01-01T00:00:00Z',
      };
      const agent = {
        id: 'agent-1',
        slug: 'test-agent',
        displayName: 'Test Agent',
        type: 'context' as const,
        organizationSlug: 'test-org',
      };

      const result = service.buildRunMetadata(base, agent);

      expect(result).toEqual({
        requestId: 'req-1',
        timestamp: '2023-01-01T00:00:00Z',
        agentId: 'agent-1',
        agentSlug: 'test-agent',
        agentType: 'context',
        organizationSlug: 'test-org',
      });
    });

    it('should merge extras with base metadata', () => {
      const base = {
        requestId: 'req-1',
      };
      const agent = {
        id: 'agent-1',
        slug: 'test-agent',
        displayName: null,
        type: null,
        organizationSlug: null,
      };
      const extras = {
        customKey: 'customValue',
        additionalData: 123,
      };

      const result = service.buildRunMetadata(base, agent, extras);

      expect(result).toEqual({
        requestId: 'req-1',
        customKey: 'customValue',
        additionalData: 123,
        agentId: 'agent-1',
        agentSlug: 'test-agent',
        agentType: null,
        organizationSlug: null,
      });
    });

    it('should handle null agent properties', () => {
      const base = {};
      const agent = {
        id: 'agent-1',
        slug: 'test-agent',
        displayName: null,
        type: null,
        organizationSlug: null,
      };

      const result = service.buildRunMetadata(base, agent);

      expect(result).toEqual({
        agentId: 'agent-1',
        agentSlug: 'test-agent',
        agentType: null,
        organizationSlug: null,
      });
    });
  });
});

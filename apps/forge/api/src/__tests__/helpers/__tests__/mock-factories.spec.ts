/**
 * Tests for Mock Factories
 *
 * Validates that factory methods create valid test data with correct defaults and overrides.
 */

import { MockFactories } from '../mock-factories';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('MockFactories', () => {
  const _mockContext = createMockExecutionContext();

  describe('Agent Factories', () => {
    describe('createAgent', () => {
      it('should create agent with default values', () => {
        const agent = MockFactories.createAgent();

        expect(agent.slug).toBeDefined();
        expect(agent.organization_slug).toEqual(['test-org']);
        expect(agent.name).toBe('Test Agent');
        expect(agent.agent_type).toBe('context');
        expect(agent.department).toBe('testing');
        expect(agent.context).toBe('You are a helpful test agent');
        expect(agent.created_at).toBeInstanceOf(Date);
        expect(agent.updated_at).toBeInstanceOf(Date);
        expect(agent.llm_config).toEqual({
          provider: 'openai',
          model: 'gpt-4o',
          parameters: { temperature: 0.7 },
        });
      });

      it('should accept overrides', () => {
        const agent = MockFactories.createAgent({
          slug: 'custom-agent',
          agent_type: 'api',
          llm_config: null,
          endpoint: { url: 'https://api.example.com/test', method: 'POST' },
        });

        expect(agent.slug).toBe('custom-agent');
        expect(agent.agent_type).toBe('api');
        expect(agent.llm_config).toBeNull();
        expect(agent.endpoint).toEqual({
          url: 'https://api.example.com/test',
          method: 'POST',
        });
      });

      it('should generate unique slugs for multiple agents', () => {
        const agent1 = MockFactories.createAgent();
        const agent2 = MockFactories.createAgent();

        expect(agent1.slug).not.toBe(agent2.slug);
      });
    });

    describe('Type-specific agent factories', () => {
      it('createContextAgent should create context agent', () => {
        const agent = MockFactories.createContextAgent();

        expect(agent.agent_type).toBe('context');
        expect(agent.department).toBe('analysis');
        expect(agent.llm_config).toEqual({
          provider: 'openai',
          model: 'gpt-4o',
          parameters: { temperature: 0.6 },
        });
      });

      it('createApiAgent should create api agent', () => {
        const agent = MockFactories.createApiAgent();

        expect(agent.agent_type).toBe('api');
        expect(agent.llm_config).toBeNull();
        expect(agent.endpoint).toEqual({
          url: 'https://api.example.com/test',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      });

      it('createExternalAgent should create external agent', () => {
        const agent = MockFactories.createExternalAgent();

        expect(agent.agent_type).toBe('external');
        expect(agent.department).toBe('external');
        expect(agent.endpoint).toBeDefined();
        expect(agent.endpoint?.url).toContain('external-agent');
      });

      it('createMediaAgent should create media agent', () => {
        const agent = MockFactories.createMediaAgent();

        expect(agent.agent_type).toBe('media');
        expect(agent.department).toBe('creative');
        expect(agent.capabilities).toContain('image-generation');
        expect(agent.metadata).toMatchObject({
          mediaType: 'image',
          defaultProvider: 'openai',
        });
      });

      it('createOrchestratorAgent should create orchestrator agent', () => {
        const agent = MockFactories.createOrchestratorAgent();

        expect(agent.agent_type).toBe('orchestrator');
        expect(agent.department).toBe('orchestration');
        expect(agent.metadata).toMatchObject({
          orchestration_slug: 'test-orchestration',
        });
      });

      it('should allow overrides on type-specific factories', () => {
        const agent = MockFactories.createContextAgent({
          slug: 'custom-context',
          llm_config: {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet',
            parameters: { temperature: 0.5 },
          },
        });

        expect(agent.slug).toBe('custom-context');
        expect(agent.agent_type).toBe('context');
        expect(agent.llm_config).toMatchObject({
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
        });
      });
    });
  });

  describe('Orchestration Factories', () => {
    describe('createOrchestrationDefinition', () => {
      it('should create orchestration definition with default values', () => {
        const definition = MockFactories.createOrchestrationDefinition();

        expect(definition.id).toBeDefined();
        expect(definition.organization_slug).toBe('test-org');
        expect(definition.slug).toBe('test-orchestration');
        expect(definition.display_name).toBe('Test Orchestration');
        expect(definition.description).toBe(
          'A test orchestration for automated testing',
        );
        expect(definition.version).toBe(1);
        expect(definition.is_active).toBe(true);
        expect(definition.created_at).toBeInstanceOf(Date);
        expect(definition.updated_at).toBeInstanceOf(Date);
        expect(definition.configuration).toEqual({
          steps: [
            { name: 'step1', agent_slug: 'agent1' },
            { name: 'step2', agent_slug: 'agent2' },
          ],
        });
      });

      it('should accept overrides', () => {
        const definition = MockFactories.createOrchestrationDefinition({
          slug: 'custom-orch',
          version: 2,
          is_active: false,
        });

        expect(definition.slug).toBe('custom-orch');
        expect(definition.version).toBe(2);
        expect(definition.is_active).toBe(false);
      });
    });

    describe('createOrchestrationRun', () => {
      it('should create orchestration run with default values', () => {
        const run = MockFactories.createOrchestrationRun();

        expect(run.id).toBeDefined();
        expect(run.organization_slug).toBe('test-org');
        expect(run.orchestration_definition_slug).toBe('test-orchestration');
        expect(run.orchestration_version).toBe(1);
        expect(run.status).toBe('pending');
        expect(run.created_at).toBeInstanceOf(Date);
        expect(run.updated_at).toBeInstanceOf(Date);
        expect(run.started_at).toBeNull();
        expect(run.completed_at).toBeNull();
        expect(run.metadata).toEqual({});
      });

      it('should accept overrides', () => {
        const startedAt = new Date();
        const run = MockFactories.createOrchestrationRun({
          status: 'in_progress',
          started_at: startedAt,
          metadata: { user_id: '123' },
        });

        expect(run.status).toBe('in_progress');
        expect(run.started_at).toBe(startedAt);
        expect(run.metadata).toEqual({ user_id: '123' });
      });
    });

    describe('createOrchestrationStep', () => {
      it('should create orchestration step with default values', () => {
        const step = MockFactories.createOrchestrationStep();

        expect(step.id).toBeDefined();
        expect(step.orchestration_run_id).toBeDefined();
        expect(step.step_name).toBe('test-step');
        expect(step.agent_slug).toBe('test-agent');
        expect(step.step_order).toBe(0);
        expect(step.status).toBe('pending');
        expect(step.created_at).toBeInstanceOf(Date);
        expect(step.updated_at).toBeInstanceOf(Date);
        expect(step.started_at).toBeNull();
        expect(step.completed_at).toBeNull();
        expect(step.conversation_id).toBeNull();
        expect(step.parent_step_id).toBeNull();
      });

      it('should accept overrides', () => {
        const conversationId = MockFactories.createConversation().id;
        const step = MockFactories.createOrchestrationStep({
          step_name: 'custom-step',
          step_order: 5,
          conversation_id: conversationId,
        });

        expect(step.step_name).toBe('custom-step');
        expect(step.step_order).toBe(5);
        expect(step.conversation_id).toBe(conversationId);
      });
    });
  });

  describe('Supporting Entity Factories', () => {
    describe('createConversation', () => {
      it('should create conversation with default values', () => {
        const conversation = MockFactories.createConversation();

        expect(conversation.id).toBeDefined();
        expect(conversation.organization_slug).toBe('test-org');
        expect(conversation.user_id).toBeDefined();
        expect(conversation.agent_slug).toBe('test-agent');
        expect(conversation.status).toBe('active');
        expect(conversation.created_at).toBeInstanceOf(Date);
        expect(conversation.updated_at).toBeInstanceOf(Date);
        expect(conversation.metadata).toEqual({});
      });

      it('should accept overrides', () => {
        const conversation = MockFactories.createConversation({
          agent_slug: 'custom-agent',
          status: 'completed',
          metadata: { source: 'api' },
        });

        expect(conversation.agent_slug).toBe('custom-agent');
        expect(conversation.status).toBe('completed');
        expect(conversation.metadata).toEqual({ source: 'api' });
      });
    });

    describe('createDeliverable', () => {
      it('should create deliverable with default values', () => {
        const deliverable = MockFactories.createDeliverable();

        expect(deliverable.id).toBeDefined();
        expect(deliverable.conversation_id).toBeDefined();
        expect(deliverable.content_type).toBe('text/plain');
        expect(deliverable.content).toBe('Test deliverable content');
        expect(deliverable.metadata).toEqual({});
        expect(deliverable.created_at).toBeInstanceOf(Date);
      });

      it('should accept overrides', () => {
        const deliverable = MockFactories.createDeliverable({
          content_type: 'application/json',
          content: '{"result": "success"}',
          metadata: { format: 'json' },
        });

        expect(deliverable.content_type).toBe('application/json');
        expect(deliverable.content).toBe('{"result": "success"}');
        expect(deliverable.metadata).toEqual({ format: 'json' });
      });
    });

    describe('createTask', () => {
      it('should create task with default values', () => {
        const task = MockFactories.createTask();

        expect(task.id).toBeDefined();
        expect(task.conversation_id).toBeDefined();
        expect(task.status).toBe('pending');
        expect(task.task_type).toBe('user_request');
        expect(task.description).toBe('Test task description');
        expect(task.metadata).toEqual({});
        expect(task.created_at).toBeInstanceOf(Date);
        expect(task.updated_at).toBeInstanceOf(Date);
      });

      it('should accept overrides', () => {
        const task = MockFactories.createTask({
          status: 'completed',
          task_type: 'system_generated',
          description: 'Custom task',
        });

        expect(task.status).toBe('completed');
        expect(task.task_type).toBe('system_generated');
        expect(task.description).toBe('Custom task');
      });
    });
  });

  describe('Batch Factories', () => {
    describe('createOrchestrationScenario', () => {
      it('should create complete orchestration scenario with 2 steps by default', () => {
        const scenario = MockFactories.createOrchestrationScenario();

        expect(scenario.definition).toBeDefined();
        expect(scenario.run).toBeDefined();
        expect(scenario.steps).toHaveLength(2);

        // Verify relationships
        expect(scenario.run.orchestration_definition_slug).toBe(
          scenario.definition.slug,
        );
        expect(scenario.steps[0]?.orchestration_run_id).toBe(scenario.run.id);
        expect(scenario.steps[1]?.orchestration_run_id).toBe(scenario.run.id);

        // Verify step ordering
        expect(scenario.steps[0]?.step_order).toBe(0);
        expect(scenario.steps[1]?.step_order).toBe(1);
      });

      it('should create scenario with custom step count', () => {
        const scenario = MockFactories.createOrchestrationScenario(5);

        expect(scenario.steps).toHaveLength(5);
        expect(scenario.steps[0]?.step_order).toBe(0);
        expect(scenario.steps[4]?.step_order).toBe(4);
      });

      it('should allow custom overrides', () => {
        const scenario = MockFactories.createOrchestrationScenario(3, {
          organizationSlug: 'custom-org',
          orchestrationSlug: 'custom-orch',
        });

        expect(scenario.definition.organization_slug).toBe('custom-org');
        expect(scenario.definition.slug).toBe('custom-orch');
        expect(scenario.run.organization_slug).toBe('custom-org');
        expect(scenario.run.orchestration_definition_slug).toBe('custom-orch');
      });
    });

    describe('createConversationWithDeliverable', () => {
      it('should create conversation with linked deliverable', () => {
        const result = MockFactories.createConversationWithDeliverable();

        expect(result.conversation).toBeDefined();
        expect(result.deliverable).toBeDefined();

        // Verify relationship
        expect(result.deliverable.conversation_id).toBe(result.conversation.id);
      });

      it('should allow custom overrides', () => {
        const result = MockFactories.createConversationWithDeliverable({
          conversationOverrides: { agent_slug: 'custom-agent' },
          deliverableOverrides: { content_type: 'application/json' },
        });

        expect(result.conversation.agent_slug).toBe('custom-agent');
        expect(result.deliverable.content_type).toBe('application/json');
      });
    });
  });

  describe('Factory Consistency', () => {
    it('should maintain referential integrity across related factories', () => {
      const definition = MockFactories.createOrchestrationDefinition({
        slug: 'test-orch',
      });

      const run = MockFactories.createOrchestrationRun({
        orchestration_definition_id: definition.id,
      });

      const step = MockFactories.createOrchestrationStep({
        orchestration_run_id: run.id,
      });

      expect(step.orchestration_run_id).toBe(run.id);
      expect(run.orchestration_definition_id).toBe(definition.id);
    });

    it('should generate valid UUID v4 IDs', () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      // Note: Agent uses slug as primary key (contains UUID suffix), not id
      const agent = MockFactories.createAgent();
      const definition = MockFactories.createOrchestrationDefinition();
      const run = MockFactories.createOrchestrationRun();
      const step = MockFactories.createOrchestrationStep();

      // Agent slug contains UUID suffix
      expect(agent.slug).toContain('test-agent-');
      expect(definition.id).toMatch(uuidRegex);
      expect(run.id).toMatch(uuidRegex);
      expect(step.id).toMatch(uuidRegex);
    });

    it('should set timestamps correctly', () => {
      const before = new Date();
      const agent = MockFactories.createAgent();
      const after = new Date();

      const createdAt = new Date(agent.created_at);
      const updatedAt = new Date(agent.updated_at);

      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
    });
  });
});

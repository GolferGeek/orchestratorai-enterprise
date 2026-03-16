import { AgentRuntimePromptService } from './agent-runtime-prompt.service';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';
import {
  AgentTaskMode,
  TaskRequestDto,
} from '@agent2agent/dto/task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

const mockExecutionContext = createMockExecutionContext({
  orgSlug: 'test-org',
  userId: 'user-1',
  agentSlug: 'test-agent',
});

const buildDefinition = (
  overrides: Partial<AgentRuntimeDefinition> = {},
): AgentRuntimeDefinition =>
  ({
    slug: 'test-agent',
    name: 'Test Agent',
    agentType: 'context',
    organizationSlug: ['test-org'],
    description: 'A test agent',
    prompts: {},
    context: null,
    config: null,
    execution: {
      modeProfile: 'full_cycle',
    },
    ...overrides,
  }) as unknown as AgentRuntimeDefinition;

const buildRequest = (
  overrides: Partial<TaskRequestDto> = {},
): TaskRequestDto =>
  ({
    mode: AgentTaskMode.CONVERSE,
    userMessage: 'Hello agent',
    payload: {},
    context: mockExecutionContext,
    ...overrides,
  }) as unknown as TaskRequestDto;

describe('AgentRuntimePromptService', () => {
  let service: AgentRuntimePromptService;

  beforeEach(() => {
    service = new AgentRuntimePromptService();
  });

  describe('buildSystemPrompt', () => {
    it('should use explicit prompts.system when provided', () => {
      const definition = buildDefinition({
        prompts: { system: 'You are a specialized test agent.' },
      });

      const result = service.buildSystemPrompt(definition, 'converse');

      expect(result).toBe('You are a specialized test agent.');
    });

    it('should fall back to context.system_prompt when prompts.system is absent', () => {
      const definition = buildDefinition({
        prompts: {},
        context: { system_prompt: 'Context system prompt.' },
      } as never);

      const result = service.buildSystemPrompt(definition, 'converse');

      expect(result).toBe('Context system prompt.');
    });

    it('should fall back to config.system_prompt when prompts and context are absent', () => {
      const definition = buildDefinition({
        prompts: {},
        context: null,
        config: { system_prompt: 'Config system prompt.' },
      } as never);

      const result = service.buildSystemPrompt(definition, 'converse');

      expect(result).toBe('Config system prompt.');
    });

    it('should use description as prompt when no system prompt configured', () => {
      const definition = buildDefinition({
        prompts: {},
        context: null,
        config: null,
        description: 'I am a helpful agent.',
      });

      const result = service.buildSystemPrompt(definition, 'converse');

      expect(result).toBe('I am a helpful agent.');
    });

    it('should generate default converse prompt when no prompt is configured', () => {
      const definition = buildDefinition({
        prompts: {},
        context: null,
        config: null,
        description: '',
      });

      const result = service.buildSystemPrompt(definition, 'converse');

      expect(result).toContain('Test Agent');
      expect(result).toContain('Respond helpfully');
    });

    it('should generate default build prompt for build mode', () => {
      const definition = buildDefinition({
        prompts: {},
        context: null,
        config: null,
        description: '',
      });

      const result = service.buildSystemPrompt(definition, 'build');

      expect(result).toContain('Test Agent');
      expect(result).toContain('actionable deliverable');
    });

    it('should generate default plan prompt for plan mode', () => {
      const definition = buildDefinition({
        prompts: {},
        context: null,
        config: null,
        description: '',
      });

      const result = service.buildSystemPrompt(definition, 'plan');

      expect(result).toContain('Test Agent');
      expect(result).toContain('comprehensive plan');
    });

    it('should append plan template for plan mode when configured', () => {
      const definition = buildDefinition({
        prompts: { system: 'You are an agent.' },
        context: { plan_template: 'Use phase 1, phase 2, phase 3.' },
      } as never);

      const result = service.buildSystemPrompt(definition, 'plan');

      expect(result).toContain('You are an agent.');
      expect(result).toContain('Use phase 1, phase 2, phase 3.');
    });

    it('should not append plan template for non-plan modes', () => {
      const definition = buildDefinition({
        prompts: { system: 'You are an agent.' },
        context: { plan_template: 'Use phases.' },
      } as never);

      const result = service.buildSystemPrompt(definition, 'converse');

      expect(result).toBe('You are an agent.');
      expect(result).not.toContain('Use phases.');
    });

    it('should default to converse mode when mode not provided', () => {
      const definition = buildDefinition({
        prompts: {},
        context: null,
        config: null,
        description: '',
      });

      const result = service.buildSystemPrompt(definition);

      expect(result).toContain('Respond helpfully');
    });
  });

  describe('buildUserMessage', () => {
    it('should use userMessage from request', () => {
      const definition = buildDefinition();
      const request = buildRequest({ userMessage: 'What is the weather?' });

      const result = service.buildUserMessage(definition, request, 'converse');

      expect(result).toContain('What is the weather?');
    });

    it('should prepend prompt_prefix when configured', () => {
      const definition = buildDefinition({
        config: { prompt_prefix: 'Context: org=test-org.' },
      } as never);
      const request = buildRequest({ userMessage: 'Hello' });

      const result = service.buildUserMessage(definition, request, 'converse');

      expect(result).toContain('Context: org=test-org.');
      expect(result).toContain('Hello');
    });

    it('should include payload.prompt when present', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        userMessage: 'Main message',
        payload: { prompt: 'Additional instructions' },
      });

      const result = service.buildUserMessage(definition, request, 'converse');

      expect(result).toContain('Main message');
      expect(result).toContain('Additional instructions');
    });

    it('should include instructions for build mode', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        userMessage: 'Build this',
        payload: { instructions: 'Must be in markdown format' },
      });

      const result = service.buildUserMessage(definition, request, 'build');

      expect(result).toContain('Build this');
      expect(result).toContain('Instructions:');
      expect(result).toContain('Must be in markdown format');
    });

    it('should not include instructions for converse mode', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        payload: { instructions: 'Should not appear' },
      });

      const result = service.buildUserMessage(definition, request, 'converse');

      expect(result).not.toContain('Instructions:');
    });

    it('should include requirements when provided', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        userMessage: 'Build this',
        payload: { requirements: ['req1', 'req2'] },
      });

      const result = service.buildUserMessage(definition, request, 'build');

      expect(result).toContain('Requirements:');
      expect(result).toContain('req1');
    });

    it('should return default build message when no pieces', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        userMessage: undefined,
        payload: {},
      });

      const result = service.buildUserMessage(definition, request, 'build');

      expect(result).toBe('Generate the requested build deliverable.');
    });

    it('should return default converse message when no pieces', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        userMessage: undefined,
        payload: {},
      });

      const result = service.buildUserMessage(definition, request, 'converse');

      expect(result).toBe('Respond to the user in a helpful manner.');
    });

    it('should include recent conversation history', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        userMessage: 'New question',
        messages: [
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' },
        ],
      } as never);

      const result = service.buildUserMessage(definition, request, 'converse');

      expect(result).toContain('Recent conversation history');
      expect(result).toContain('Previous question');
      expect(result).toContain('Previous answer');
    });

    it('should limit conversation history to last 6 messages', () => {
      const definition = buildDefinition();
      const messages = Array.from({ length: 10 }, (_, i) => ({
        role: 'user',
        content: `Message ${i + 1}`,
      }));
      const request = buildRequest({
        userMessage: 'Latest',
        messages,
      } as never);

      const result = service.buildUserMessage(definition, request, 'converse');

      // Should include messages 5-10 (last 6)
      expect(result).toContain('Message 5');
      expect(result).toContain('Message 10');
      // Should not include Message 1-4
      expect(result).not.toContain('Message 1\n');
      expect(result).not.toContain('Message 4\n');
    });
  });

  describe('buildPromptPayload', () => {
    it('should build a complete prompt payload', () => {
      const definition = buildDefinition({
        prompts: { system: 'System prompt.' },
      });
      const request = buildRequest({
        userMessage: 'User message',
        context: {
          ...mockExecutionContext,
          conversationId: 'conv-1',
          taskId: 'task-1',
        },
      });

      const result = service.buildPromptPayload({
        definition,
        request,
        mode: 'converse',
      });

      expect(result.systemPrompt).toBe('System prompt.');
      expect(result.userMessage).toContain('User message');
      expect(result.conversationId).toBe('conv-1');
      expect(result.sessionId).toBe('task-1');
    });

    it('should resolve userId from metadata', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        payload: { metadata: { userId: 'user-from-payload' } },
      });

      const result = service.buildPromptPayload({
        definition,
        request,
        mode: 'converse',
      });

      expect(result.userId).toBe('user-from-payload');
    });

    it('should resolve userId from top-level payload', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        payload: { userId: 'direct-user-id' },
      });

      const result = service.buildPromptPayload({
        definition,
        request,
        mode: 'converse',
      });

      expect(result.userId).toBe('direct-user-id');
    });

    it('should return null userId when not found', () => {
      const definition = buildDefinition();
      const request = buildRequest({ payload: {} });

      const result = service.buildPromptPayload({
        definition,
        request,
        mode: 'converse',
      });

      expect(result.userId).toBeNull();
    });

    it('should default to converse mode when mode not specified', () => {
      const definition = buildDefinition({
        prompts: {},
        context: null,
        config: null,
        description: '',
      });
      const request = buildRequest();

      const result = service.buildPromptPayload({ definition, request });

      expect(result.systemPrompt).toContain('Respond helpfully');
    });

    it('should merge additional metadata into optionMetadata', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        payload: { options: { metadata: { existingKey: 'existingVal' } } },
      });

      const result = service.buildPromptPayload({
        definition,
        request,
        mode: 'converse',
        additionalMetadata: { extraKey: 'extraVal' },
      });

      expect(result.optionMetadata).toMatchObject({
        existingKey: 'existingVal',
        extraKey: 'extraVal',
      });
    });
  });

  describe('collectMetadata', () => {
    it('should collect base agent metadata', () => {
      const definition = buildDefinition({
        agentType: 'context',
        execution: { modeProfile: 'full_cycle' },
        organizationSlug: ['test-org'],
      } as never);
      const request = buildRequest();

      const result = service.collectMetadata(definition, request, undefined);

      expect(result['agentSlug']).toBe('test-agent');
      expect(result['agentType']).toBe('context');
    });

    it('should merge payload metadata', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        payload: { metadata: { customKey: 'customVal' } },
      });

      const result = service.collectMetadata(definition, request, undefined);

      expect(result['customKey']).toBe('customVal');
    });

    it('should merge request metadata', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        metadata: { requestKey: 'requestVal' },
      } as never);

      const result = service.collectMetadata(definition, request, undefined);

      expect(result['requestKey']).toBe('requestVal');
    });

    it('should merge additional metadata with highest priority', () => {
      const definition = buildDefinition();
      const request = buildRequest({
        payload: { metadata: { key: 'from-payload' } },
        metadata: { key: 'from-request' },
      } as never);

      const result = service.collectMetadata(definition, request, {
        key: 'from-additional',
      });

      // additional takes precedence
      expect(result['key']).toBe('from-additional');
    });
  });

  describe('mapComplexity', () => {
    it('should map score < 0.3 to simple', () => {
      expect(service.mapComplexity(0.1)).toBe('simple');
      expect(service.mapComplexity(0.0)).toBe('simple');
      expect(service.mapComplexity(0.29)).toBe('simple');
    });

    it('should map score 0.3-0.7 to medium', () => {
      expect(service.mapComplexity(0.3)).toBe('medium');
      expect(service.mapComplexity(0.5)).toBe('medium');
      expect(service.mapComplexity(0.69)).toBe('medium');
    });

    it('should map score >= 0.7 to complex', () => {
      expect(service.mapComplexity(0.7)).toBe('complex');
      expect(service.mapComplexity(1.0)).toBe('complex');
      expect(service.mapComplexity(0.99)).toBe('complex');
    });

    it('should return undefined for null, undefined, or NaN', () => {
      expect(service.mapComplexity(null)).toBeUndefined();
      expect(service.mapComplexity(undefined)).toBeUndefined();
      expect(service.mapComplexity(NaN)).toBeUndefined();
    });
  });
});

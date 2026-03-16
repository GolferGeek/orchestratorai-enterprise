import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  TaskRequestDto,
  ExecutionContextDto,
  TaskMessageDto,
  AgentTaskMode,
} from './task-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('TaskRequestDto', () => {
  describe('ExecutionContextDto validation', () => {
    it('should accept valid ExecutionContext', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(ExecutionContextDto, mockContext);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject missing userId', async () => {
      const mockContext = createMockExecutionContext();
      const invalidContext = { ...mockContext, userId: undefined };
      const dto = plainToInstance(ExecutionContextDto, invalidContext);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'userId')).toBe(true);
    });

    it('should reject missing conversationId', async () => {
      const mockContext = createMockExecutionContext();
      const invalidContext = { ...mockContext, conversationId: undefined };
      const dto = plainToInstance(ExecutionContextDto, invalidContext);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'conversationId')).toBe(true);
    });

    it('should reject missing required fields', async () => {
      const dto = plainToInstance(ExecutionContextDto, {
        userId: 'user-1',
        // Missing all other required fields
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const propertyNames = errors.map((e) => e.property);
      expect(propertyNames).toContain('orgSlug');
      expect(propertyNames).toContain('conversationId');
    });
  });

  describe('TaskRequestDto validation', () => {
    it('should accept valid task request with all fields', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        mode: AgentTaskMode.CONVERSE,
        userMessage: 'Test message',
        payload: { action: 'create' },
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        metadata: { source: 'web-ui' },
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should accept task request with only required context', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject missing context', async () => {
      const dto = plainToInstance(TaskRequestDto, {
        mode: AgentTaskMode.PLAN,
        userMessage: 'Create a plan',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'context')).toBe(true);
    });

    it('should reject invalid mode', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        mode: 'INVALID_MODE',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'mode')).toBe(true);
    });

    it('should accept valid AgentTaskMode values', async () => {
      const mockContext = createMockExecutionContext();
      const modes = [
        AgentTaskMode.PLAN,
        AgentTaskMode.BUILD,
        AgentTaskMode.CONVERSE,
        AgentTaskMode.HITL,
      ];

      for (const mode of modes) {
        const dto = plainToInstance(TaskRequestDto, {
          context: mockContext,
          mode,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('should accept task request with messages array', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: { text: 'Hi', metadata: {} } },
        ],
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should accept task request with payload object', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        payload: {
          action: 'create',
          title: 'Test Plan',
          forceNew: true,
        },
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should accept task request with promptParameters', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        promptParameters: {
          temperature: 0.7,
          maxTokens: 1000,
        },
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should validate nested context object', async () => {
      const dto = plainToInstance(TaskRequestDto, {
        context: {
          userId: 'user-1',
          // Missing required fields
        },
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('TaskMessageDto validation', () => {
    it('should accept valid message with string content', async () => {
      const dto = plainToInstance(TaskMessageDto, {
        role: 'user',
        content: 'Hello',
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should accept valid message with object content', async () => {
      const dto = plainToInstance(TaskMessageDto, {
        role: 'assistant',
        content: { text: 'Hi', metadata: {} },
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should accept message without content (optional)', async () => {
      const dto = plainToInstance(TaskMessageDto, {
        role: 'system',
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject missing role', async () => {
      const dto = plainToInstance(TaskMessageDto, {
        content: 'Hello',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'role')).toBe(true);
    });
  });

  describe('AgentTaskMode enum', () => {
    it('should have all expected modes', () => {
      expect(AgentTaskMode.PLAN).toBe('plan');
      expect(AgentTaskMode.BUILD).toBe('build');
      expect(AgentTaskMode.CONVERSE).toBe('converse');
      expect(AgentTaskMode.HITL).toBe('hitl');
    });
  });

  describe('Transport-types compliance', () => {
    it('should work with ExecutionContext from transport-types', async () => {
      const mockContext = createMockExecutionContext({
        userId: 'test-user',
        conversationId: 'conv-123',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
      });

      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        mode: AgentTaskMode.CONVERSE,
        userMessage: 'Test',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.context.provider).toBe('anthropic');
      expect(dto.context.model).toBe('claude-3-sonnet');
    });

    it('should validate payload structure for PLAN mode', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        mode: AgentTaskMode.PLAN,
        payload: {
          action: 'create',
          title: 'Test Plan',
          content: 'Plan content',
          forceNew: false,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate payload structure for BUILD mode', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        mode: AgentTaskMode.BUILD,
        payload: {
          action: 'create',
          title: 'Test Deliverable',
          type: 'document',
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate payload structure for HITL mode', async () => {
      const mockContext = createMockExecutionContext();
      const dto = plainToInstance(TaskRequestDto, {
        context: mockContext,
        mode: AgentTaskMode.HITL,
        payload: {
          action: 'resume',
          taskId: 'task-123',
          decision: 'approve',
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Error messages', () => {
    it('should provide clear error messages for validation failures', async () => {
      const dto = plainToInstance(TaskRequestDto, {
        context: {
          userId: '',
          // Empty userId should fail
        },
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate nested objects correctly', async () => {
      const dto = plainToInstance(TaskRequestDto, {
        context: {
          userId: 'user-1',
          conversationId: 'conv-1',
          orgSlug: 'org-1',
          taskId: 'task-1',
          planId: 'plan-1',
          deliverableId: 'del-1',
          agentSlug: 'agent-1',
          agentType: 'context',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});

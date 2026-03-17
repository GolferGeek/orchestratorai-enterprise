import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WorkflowRequestDto } from './workflow-request.dto';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('WorkflowRequestDto', () => {
  describe('Validation - Happy Path', () => {
    it('should validate a valid WorkflowRequestDto', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const validData = {
        context: mockContext,
        prompt: 'Analyze this data and provide insights',
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, validData);
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.context).toEqual(mockContext);
      expect(dto.prompt).toBe(validData.prompt);
    });

    it('should validate with optional statusWebhook URL', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'anthropic',
        model: 'claude-3-opus',
      });

      const validData = {
        context: mockContext,
        prompt: 'Write a blog post about AI',
        statusWebhook: 'http://test-api-host:8080/webhooks/status',
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, validData);
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.statusWebhook).toBe(validData.statusWebhook);
    });

    it('should validate with HTTPS statusWebhook URL', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4-turbo',
      });

      const validData = {
        context: mockContext,
        prompt: 'Generate a report',
        statusWebhook: 'https://api.example.com/webhooks/task-updates',
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, validData);
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.statusWebhook).toBe(validData.statusWebhook);
    });

    it('should validate with optional metadata', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });

      const validData = {
        context: mockContext,
        prompt: 'Create a marketing campaign',
        metadata: {
          organizationId: 'org-123',
          priority: 'high',
          deadline: '2025-12-31',
          tags: ['marketing', 'campaign'],
        },
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, validData);
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.metadata).toEqual(validData.metadata);
    });

    it('should validate without optional fields', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const validData = {
        context: mockContext,
        prompt: 'Test prompt',
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, validData);
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.statusWebhook).toBeUndefined();
      expect(dto.metadata).toBeUndefined();
    });
  });

  describe('Validation - Invalid ExecutionContext', () => {
    it('should fail validation when context is missing', async () => {
      // Arrange
      const invalidData = {
        prompt: 'Test prompt',
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const contextError = errors.find((error) => error.property === 'context');
      expect(contextError).toBeDefined();
    });

    it('should fail validation when context is not a valid ExecutionContext', async () => {
      // Arrange
      const invalidData = {
        context: {
          conversationId: '550e8400-e29b-41d4-a716-446655440000',
          // Missing required ExecutionContext fields
        },
        prompt: 'Test prompt',
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const contextError = errors.find((error) => error.property === 'context');
      expect(contextError).toBeDefined();
      expect(contextError?.constraints).toHaveProperty(
        'isValidExecutionContext',
      );
    });

    it('should fail validation when context has invalid field types', async () => {
      // Arrange
      const invalidData = {
        context: {
          orgSlug: 'test-org',
          userId: 123, // Should be string
          conversationId: '660e8400-e29b-41d4-a716-446655440001',
          conversationId: '550e8400-e29b-41d4-a716-446655440000',
          agentSlug: 'test-agent',
          agentType: 'test-type',
          provider: 'openai',
          model: 'gpt-4',
        },
        prompt: 'Test prompt',
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const contextError = errors.find((error) => error.property === 'context');
      expect(contextError).toBeDefined();
    });
  });

  describe('Validation - Missing Required Fields', () => {
    it('should fail validation when prompt is missing', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const invalidData = {
        context: mockContext,
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const promptError = errors.find((error) => error.property === 'prompt');
      expect(promptError).toBeDefined();
    });
  });

  describe('Validation - Invalid String Fields', () => {
    it('should fail validation when prompt is not a string', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const invalidData = {
        context: mockContext,
        prompt: ['Test', 'prompt'], // Should be string
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const promptError = errors.find((error) => error.property === 'prompt');
      expect(promptError).toBeDefined();
      expect(promptError?.constraints).toHaveProperty('isString');
    });
  });

  describe('Validation - Invalid URL Fields', () => {
    it('should fail validation when statusWebhook is not a valid URL', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const invalidData = {
        context: mockContext,
        prompt: 'Test prompt',
        statusWebhook: 'not-a-valid-url',
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const statusWebhookError = errors.find(
        (error) => error.property === 'statusWebhook',
      );
      expect(statusWebhookError).toBeDefined();
      expect(statusWebhookError?.constraints).toHaveProperty('isUrl');
    });

    it('should fail validation when statusWebhook has no protocol', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const invalidData = {
        context: mockContext,
        prompt: 'Test prompt',
        statusWebhook: 'test-api-host:8080/webhooks', // Missing protocol
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const statusWebhookError = errors.find(
        (error) => error.property === 'statusWebhook',
      );
      expect(statusWebhookError).toBeDefined();
      expect(statusWebhookError?.constraints).toHaveProperty('isUrl');
    });
  });

  describe('Validation - Invalid Metadata Field', () => {
    it('should fail validation when metadata is not an object', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const invalidData = {
        context: mockContext,
        prompt: 'Test prompt',
        metadata: 'not-an-object', // Should be object
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const metadataError = errors.find(
        (error) => error.property === 'metadata',
      );
      expect(metadataError).toBeDefined();
      expect(metadataError?.constraints).toHaveProperty('isObject');
    });

    it('should fail validation when metadata is an array', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const invalidData = {
        context: mockContext,
        prompt: 'Test prompt',
        metadata: ['item1', 'item2'], // Should be object, not array
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, invalidData);
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      const metadataError = errors.find(
        (error) => error.property === 'metadata',
      );
      expect(metadataError).toBeDefined();
      expect(metadataError?.constraints).toHaveProperty('isObject');
    });
  });

  describe('Common Provider and Model Combinations', () => {
    it.each([
      ['openai', 'gpt-4'],
      ['openai', 'gpt-4-turbo'],
      ['openai', 'gpt-3.5-turbo'],
      ['anthropic', 'claude-3-opus'],
      ['anthropic', 'claude-3-sonnet'],
      ['anthropic', 'claude-sonnet-4-20250514'],
    ])(
      "should validate with provider '%s' and model '%s'",
      async (provider, model) => {
        // Arrange
        const mockContext = createMockExecutionContext({
          conversationId: '550e8400-e29b-41d4-a716-446655440000',
          conversationId: '660e8400-e29b-41d4-a716-446655440001',
          userId: '770e8400-e29b-41d4-a716-446655440002',
          provider,
          model,
        });

        const validData = {
          context: mockContext,
          prompt: 'Test prompt',
        };

        // Act
        const dto = plainToInstance(WorkflowRequestDto, validData);
        const errors = await validate(dto);

        // Assert
        expect(errors).toHaveLength(0);
        expect(dto.context.provider).toBe(provider);
        expect(dto.context.model).toBe(model);
      },
    );
  });

  describe('Edge Cases', () => {
    it('should validate with empty string prompt (validation passes, business logic may reject)', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const validData = {
        context: mockContext,
        prompt: '', // Empty but still a string
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, validData);
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.prompt).toBe('');
    });

    it('should validate with very long prompt', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const longPrompt = 'A'.repeat(10000);
      const validData = {
        context: mockContext,
        prompt: longPrompt,
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, validData);
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.prompt).toBe(longPrompt);
    });

    it('should validate with nested metadata', async () => {
      // Arrange
      const mockContext = createMockExecutionContext({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        userId: '770e8400-e29b-41d4-a716-446655440002',
        provider: 'openai',
        model: 'gpt-4',
      });

      const validData = {
        context: mockContext,
        prompt: 'Test prompt',
        metadata: {
          nested: {
            level1: {
              level2: {
                value: 'deep nesting',
              },
            },
          },
        },
      };

      // Act
      const dto = plainToInstance(WorkflowRequestDto, validData);
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.metadata).toEqual(validData.metadata);
    });
  });
});

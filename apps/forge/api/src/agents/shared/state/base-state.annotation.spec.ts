import { z } from 'zod';
import {
  WorkflowInputSchema,
  WorkflowInput,
  HitlStateSchema,
  HitlStateType,
  WorkflowMetadataSchema,
  WorkflowMetadata,
  BaseStateAnnotation,
  BaseState,
  validateWorkflowInput,
  safeValidateWorkflowInput,
  formatValidationErrors,
} from './base-state.annotation';

/**
 * Unit tests for base-state.annotation
 *
 * Tests all validation functions, Zod schemas, and BaseStateAnnotation default values.
 * Validates ExecutionContext field handling and proper error messages.
 */
describe('base-state.annotation', () => {
  describe('WorkflowInputSchema', () => {
    describe('valid inputs', () => {
      it('should validate input with all required fields', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          userMessage: 'Hello, world!',
          agentSlug: 'test-agent',
        };

        const result = WorkflowInputSchema.parse(input);

        expect(result).toMatchObject({
          taskId: 'task-123',
          userId: 'user-456',
          userMessage: 'Hello, world!',
          agentSlug: 'test-agent',
          provider: 'anthropic', // default value
          model: 'claude-sonnet-4-20250514', // default value
        });
      });

      it('should validate input with optional fields', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          conversationId: 'conv-789',
          organizationSlug: 'test-org',
          userMessage: 'Hello, world!',
          agentSlug: 'test-agent',
          metadata: { key: 'value', count: 42 },
        };

        const result = WorkflowInputSchema.parse(input);

        expect(result).toMatchObject({
          taskId: 'task-123',
          userId: 'user-456',
          conversationId: 'conv-789',
          organizationSlug: 'test-org',
          userMessage: 'Hello, world!',
          agentSlug: 'test-agent',
          metadata: { key: 'value', count: 42 },
        });
      });

      it('should apply default values for provider and model', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          userMessage: 'Test message',
          agentSlug: 'test-agent',
        };

        const result = WorkflowInputSchema.parse(input);

        expect(result.provider).toBe('anthropic');
        expect(result.model).toBe('claude-sonnet-4-20250514');
      });

      it('should allow custom provider and model', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          userMessage: 'Test message',
          agentSlug: 'test-agent',
          provider: 'openai',
          model: 'gpt-4',
        };

        const result = WorkflowInputSchema.parse(input);

        expect(result.provider).toBe('openai');
        expect(result.model).toBe('gpt-4');
      });

      it('should accept metadata as record of unknown', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          userMessage: 'Test message',
          agentSlug: 'test-agent',
          metadata: {
            string: 'value',
            number: 123,
            boolean: true,
            nested: { key: 'nested-value' },
            array: [1, 2, 3],
          },
        };

        const result = WorkflowInputSchema.parse(input);

        expect(result.metadata).toEqual(input.metadata);
      });
    });

    describe('invalid inputs', () => {
      it('should reject input with missing taskId', () => {
        const input = {
          userId: 'user-456',
          userMessage: 'Test message',
          agentSlug: 'test-agent',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject input with empty taskId', () => {
        const input = {
          taskId: '',
          userId: 'user-456',
          userMessage: 'Test message',
          agentSlug: 'test-agent',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
        try {
          WorkflowInputSchema.parse(input);
        } catch (error) {
          expect((error as z.ZodError).errors[0]!.message).toBe(
            'taskId is required',
          );
        }
      });

      it('should reject input with missing userId', () => {
        const input = {
          taskId: 'task-123',
          userMessage: 'Test message',
          agentSlug: 'test-agent',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject input with empty userId', () => {
        const input = {
          taskId: 'task-123',
          userId: '',
          userMessage: 'Test message',
          agentSlug: 'test-agent',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
        try {
          WorkflowInputSchema.parse(input);
        } catch (error) {
          expect((error as z.ZodError).errors[0]!.message).toBe(
            'userId is required',
          );
        }
      });

      it('should reject input with missing userMessage', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          agentSlug: 'test-agent',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject input with empty userMessage', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          userMessage: '',
          agentSlug: 'test-agent',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
        try {
          WorkflowInputSchema.parse(input);
        } catch (error) {
          expect((error as z.ZodError).errors[0]!.message).toBe(
            'userMessage is required',
          );
        }
      });

      it('should reject input with missing agentSlug', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          userMessage: 'Test message',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject input with empty agentSlug', () => {
        const input = {
          taskId: 'task-123',
          userId: 'user-456',
          userMessage: 'Test message',
          agentSlug: '',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
        try {
          WorkflowInputSchema.parse(input);
        } catch (error) {
          expect((error as z.ZodError).errors[0]!.message).toBe(
            'agentSlug is required',
          );
        }
      });

      it('should reject input with wrong types', () => {
        const input = {
          taskId: 123, // should be string
          userId: 'user-456',
          userMessage: 'Test message',
          agentSlug: 'test-agent',
        };

        expect(() => WorkflowInputSchema.parse(input)).toThrow(z.ZodError);
      });
    });
  });

  describe('HitlStateSchema', () => {
    describe('valid inputs', () => {
      it('should validate empty HITL state with defaults', () => {
        const result = HitlStateSchema.parse({});

        expect(result).toEqual({
          hitlStatus: 'none',
        });
      });

      it('should validate HITL request', () => {
        const input = {
          hitlRequest: {
            taskId: 'task-123',
            threadId: 'thread-456',
            agentSlug: 'test-agent',
            userId: 'user-789',
            pendingContent: { data: 'test' },
            contentType: 'json',
          },
        };

        const result = HitlStateSchema.parse(input);

        expect(result.hitlRequest).toMatchObject(input.hitlRequest);
      });

      it('should validate HITL request with optional fields', () => {
        const input = {
          hitlRequest: {
            taskId: 'task-123',
            threadId: 'thread-456',
            agentSlug: 'test-agent',
            userId: 'user-789',
            conversationId: 'conv-abc',
            organizationSlug: 'test-org',
            pendingContent: { data: 'test' },
            contentType: 'json',
            message: 'Please review this content',
          },
        };

        const result = HitlStateSchema.parse(input);

        expect(result.hitlRequest).toMatchObject(input.hitlRequest);
      });

      it('should validate HITL response with approve decision', () => {
        const input = {
          hitlResponse: {
            decision: 'approve' as const,
          },
        };

        const result = HitlStateSchema.parse(input);

        expect(result.hitlResponse).toEqual({ decision: 'approve' });
      });

      it('should validate HITL response with edit decision', () => {
        const input = {
          hitlResponse: {
            decision: 'edit' as const,
            editedContent: { updated: 'data' },
            feedback: 'Made some changes',
          },
        };

        const result = HitlStateSchema.parse(input);

        expect(result.hitlResponse).toMatchObject(input.hitlResponse);
      });

      it('should validate HITL response with reject decision', () => {
        const input = {
          hitlResponse: {
            decision: 'reject' as const,
            feedback: 'This is not acceptable',
          },
        };

        const result = HitlStateSchema.parse(input);

        expect(result.hitlResponse).toMatchObject(input.hitlResponse);
      });

      it('should validate all HITL status values', () => {
        expect(HitlStateSchema.parse({ hitlStatus: 'none' }).hitlStatus).toBe(
          'none',
        );
        expect(
          HitlStateSchema.parse({ hitlStatus: 'waiting' }).hitlStatus,
        ).toBe('waiting');
        expect(
          HitlStateSchema.parse({ hitlStatus: 'resumed' }).hitlStatus,
        ).toBe('resumed');
      });
    });

    describe('invalid inputs', () => {
      it('should reject invalid HITL status', () => {
        const input = {
          hitlStatus: 'invalid',
        };

        expect(() => HitlStateSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject invalid decision in hitlResponse', () => {
        const input = {
          hitlResponse: {
            decision: 'invalid',
          },
        };

        expect(() => HitlStateSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject hitlRequest with missing required fields', () => {
        const input = {
          hitlRequest: {
            taskId: 'task-123',
            // missing threadId, agentSlug, userId, etc.
          },
        };

        expect(() => HitlStateSchema.parse(input)).toThrow(z.ZodError);
      });
    });
  });

  describe('WorkflowMetadataSchema', () => {
    describe('valid inputs', () => {
      it('should validate empty metadata with defaults', () => {
        const result = WorkflowMetadataSchema.parse({});

        expect(result).toEqual({
          stepCount: 0,
          errors: [],
        });
      });

      it('should validate metadata with all fields', () => {
        const input = {
          startedAt: Date.now(),
          completedAt: Date.now() + 1000,
          currentStep: 'processing',
          stepCount: 5,
          errors: ['Error 1', 'Error 2'],
        };

        const result = WorkflowMetadataSchema.parse(input);

        expect(result).toMatchObject(input);
      });

      it('should validate metadata with optional fields', () => {
        const input = {
          startedAt: 1234567890,
          currentStep: 'analyzing',
        };

        const result = WorkflowMetadataSchema.parse(input);

        expect(result).toMatchObject({
          startedAt: 1234567890,
          currentStep: 'analyzing',
          stepCount: 0,
          errors: [],
        });
      });

      it('should accept empty errors array', () => {
        const input = {
          errors: [],
        };

        const result = WorkflowMetadataSchema.parse(input);

        expect(result.errors).toEqual([]);
      });

      it('should accept multiple errors', () => {
        const input = {
          errors: ['Error 1', 'Error 2', 'Error 3'],
        };

        const result = WorkflowMetadataSchema.parse(input);

        expect(result.errors).toEqual(['Error 1', 'Error 2', 'Error 3']);
      });
    });

    describe('invalid inputs', () => {
      it('should reject invalid timestamp types', () => {
        const input = {
          startedAt: 'not-a-number',
        };

        expect(() => WorkflowMetadataSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject invalid stepCount type', () => {
        const input = {
          stepCount: 'not-a-number',
        };

        expect(() => WorkflowMetadataSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject non-array errors field', () => {
        const input = {
          errors: 'not-an-array',
        };

        expect(() => WorkflowMetadataSchema.parse(input)).toThrow(z.ZodError);
      });

      it('should reject errors array with non-string elements', () => {
        const input = {
          errors: [123, 456],
        };

        expect(() => WorkflowMetadataSchema.parse(input)).toThrow(z.ZodError);
      });
    });
  });

  describe('validateWorkflowInput()', () => {
    it('should return parsed data for valid input', () => {
      const input = {
        taskId: 'task-123',
        userId: 'user-456',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
      };

      const result = validateWorkflowInput(input);

      expect(result).toMatchObject({
        taskId: 'task-123',
        userId: 'user-456',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      });
    });

    it('should throw ZodError for invalid input', () => {
      const input = {
        taskId: 'task-123',
        // missing required fields
      };

      expect(() => validateWorkflowInput(input)).toThrow(z.ZodError);
    });

    it('should throw ZodError with proper error details', () => {
      const input = {
        taskId: '',
        userId: 'user-456',
        userMessage: 'Test',
        agentSlug: 'test-agent',
      };

      try {
        validateWorkflowInput(input);
        fail('Should have thrown ZodError');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).errors).toHaveLength(1);
        expect((error as z.ZodError).errors[0]!.path).toEqual(['taskId']);
      }
    });
  });

  describe('safeValidateWorkflowInput()', () => {
    it('should return success result for valid input', () => {
      const input = {
        taskId: 'task-123',
        userId: 'user-456',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
      };

      const result = safeValidateWorkflowInput(input);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        taskId: 'task-123',
        userId: 'user-456',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
      });
      expect(result.error).toBeUndefined();
    });

    it('should return error result for invalid input', () => {
      const input = {
        taskId: 'task-123',
        // missing required fields
      };

      const result = safeValidateWorkflowInput(input);

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeInstanceOf(z.ZodError);
    });

    it('should include error details in error result', () => {
      const input = {
        taskId: '',
        userId: '',
        userMessage: '',
        agentSlug: '',
      };

      const result = safeValidateWorkflowInput(input);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(z.ZodError);
      expect(result.error?.errors.length).toBeGreaterThan(0);
    });

    it('should not throw for invalid input', () => {
      const input = { invalid: 'data' };

      expect(() => safeValidateWorkflowInput(input)).not.toThrow();
    });
  });

  describe('formatValidationErrors()', () => {
    it('should format single error', () => {
      const input = {
        taskId: '',
        userId: 'user-123',
        userMessage: 'Test',
        agentSlug: 'test-agent',
      };

      try {
        WorkflowInputSchema.parse(input);
      } catch (error) {
        const formatted = formatValidationErrors(error as z.ZodError);
        expect(formatted).toBe('taskId: taskId is required');
      }
    });

    it('should format multiple errors with semicolon separator', () => {
      const input = {
        taskId: '',
        userId: '',
        userMessage: 'Test',
        agentSlug: 'test-agent',
      };

      try {
        WorkflowInputSchema.parse(input);
      } catch (error) {
        const formatted = formatValidationErrors(error as z.ZodError);
        expect(formatted).toContain('taskId: taskId is required');
        expect(formatted).toContain('userId: userId is required');
        expect(formatted).toContain(';');
      }
    });

    it('should format nested path errors', () => {
      const schema = z.object({
        nested: z.object({
          field: z.string().min(1),
        }),
      });

      try {
        schema.parse({ nested: { field: '' } });
      } catch (error) {
        const formatted = formatValidationErrors(error as z.ZodError);
        expect(formatted).toContain('nested.field');
      }
    });

    it('should handle errors with empty paths', () => {
      const schema = z.string();

      try {
        schema.parse(123);
      } catch (error) {
        const formatted = formatValidationErrors(error as z.ZodError);
        expect(formatted).toBeTruthy();
        expect(formatted).not.toContain('undefined');
      }
    });

    it('should format all error messages in order', () => {
      const input = {
        taskId: '',
        userId: '',
        userMessage: '',
        agentSlug: '',
      };

      try {
        WorkflowInputSchema.parse(input);
      } catch (error) {
        const formatted = formatValidationErrors(error as z.ZodError);
        const errors = formatted.split('; ');
        expect(errors.length).toBe(4);
      }
    });
  });

  describe('BaseStateAnnotation', () => {
    it('should have all required state fields defined', () => {
      // Test the annotation structure exists
      expect(BaseStateAnnotation.spec.executionContext).toBeDefined();
      expect(BaseStateAnnotation.spec.taskId).toBeDefined();
      expect(BaseStateAnnotation.spec.threadId).toBeDefined();
      expect(BaseStateAnnotation.spec.userId).toBeDefined();
      expect(BaseStateAnnotation.spec.conversationId).toBeDefined();
      expect(BaseStateAnnotation.spec.organizationSlug).toBeDefined();
      expect(BaseStateAnnotation.spec.agentSlug).toBeDefined();
      expect(BaseStateAnnotation.spec.provider).toBeDefined();
      expect(BaseStateAnnotation.spec.model).toBeDefined();
      expect(BaseStateAnnotation.spec.userMessage).toBeDefined();
      expect(BaseStateAnnotation.spec.result).toBeDefined();
      expect(BaseStateAnnotation.spec.error).toBeDefined();
      expect(BaseStateAnnotation.spec.hitlRequest).toBeDefined();
      expect(BaseStateAnnotation.spec.hitlResponse).toBeDefined();
      expect(BaseStateAnnotation.spec.hitlStatus).toBeDefined();
      expect(BaseStateAnnotation.spec.metadata).toBeDefined();
    });

    it('should have executionContext field for capsule pattern', () => {
      // Verify executionContext field exists
      expect(BaseStateAnnotation.spec.executionContext).toBeDefined();

      // Verify it can hold ExecutionContext
      const partialState: Partial<BaseState> = {
        executionContext: {
          orgSlug: 'test-org',
          userId: 'user-123',
          conversationId: 'conv-456',
          taskId: 'task-789',
          planId: '00000000-0000-0000-0000-000000000000',
          deliverableId: '00000000-0000-0000-0000-000000000000',
          agentSlug: 'test-agent',
          agentType: 'context',
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        },
      };

      expect(partialState.executionContext).toBeDefined();
      expect(partialState.executionContext?.userId).toBe('user-123');
      expect(partialState.executionContext?.orgSlug).toBe('test-org');
    });

    it('should include MessagesAnnotation fields', () => {
      // MessagesAnnotation provides the 'messages' field
      expect(BaseStateAnnotation.spec.messages).toBeDefined();
    });

    it('should be compatible with BaseState type', () => {
      // Verify BaseState type can be used correctly
      const partialState: Partial<BaseState> = {
        taskId: 'task-123',
        userId: 'user-456',
        agentSlug: 'test-agent',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      };

      expect(partialState.taskId).toBe('task-123');
      expect(partialState.userId).toBe('user-456');
      expect(partialState.agentSlug).toBe('test-agent');
    });

    it('should support HITL state fields', () => {
      // Verify HITL fields are properly typed
      const partialState: Partial<BaseState> = {
        hitlStatus: 'waiting',
        hitlRequest: {
          taskId: 'task-123',
          threadId: 'thread-456',
          agentSlug: 'test-agent',
          userId: 'user-789',
          pendingContent: {},
          contentType: 'json',
        },
      };

      expect(partialState.hitlStatus).toBe('waiting');
      expect(partialState.hitlRequest?.taskId).toBe('task-123');
    });

    it('should support metadata field', () => {
      // Verify metadata field is properly typed
      const partialState: Partial<BaseState> = {
        metadata: {
          stepCount: 5,
          errors: ['Error 1'],
          currentStep: 'processing',
        },
      };

      expect(partialState.metadata?.stepCount).toBe(5);
      expect(partialState.metadata?.errors).toEqual(['Error 1']);
    });
  });

  describe('ExecutionContext field handling', () => {
    it('should support userId field for ExecutionContext compatibility', () => {
      const input = {
        taskId: 'task-123',
        userId: 'exec-context-user-id',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
      };

      const result = validateWorkflowInput(input);

      expect(result.userId).toBe('exec-context-user-id');
    });

    it('should support organizationSlug field for ExecutionContext compatibility', () => {
      const input = {
        taskId: 'task-123',
        userId: 'user-456',
        organizationSlug: 'test-org',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
      };

      const result = validateWorkflowInput(input);

      expect(result.organizationSlug).toBe('test-org');
    });

    it('should support conversationId field for ExecutionContext compatibility', () => {
      const input = {
        taskId: 'task-123',
        userId: 'user-456',
        conversationId: 'conv-789',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
      };

      const result = validateWorkflowInput(input);

      expect(result.conversationId).toBe('conv-789');
    });

    it('should support agentSlug field for ExecutionContext compatibility', () => {
      const input = {
        taskId: 'task-123',
        userId: 'user-456',
        userMessage: 'Test message',
        agentSlug: 'context-agent',
      };

      const result = validateWorkflowInput(input);

      expect(result.agentSlug).toBe('context-agent');
    });

    it('should support provider field for ExecutionContext compatibility', () => {
      const input = {
        taskId: 'task-123',
        userId: 'user-456',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
        provider: 'openai',
      };

      const result = validateWorkflowInput(input);

      expect(result.provider).toBe('openai');
    });

    it('should support model field for ExecutionContext compatibility', () => {
      const input = {
        taskId: 'task-123',
        userId: 'user-456',
        userMessage: 'Test message',
        agentSlug: 'test-agent',
        model: 'gpt-4',
      };

      const result = validateWorkflowInput(input);

      expect(result.model).toBe('gpt-4');
    });
  });

  describe('Type exports', () => {
    it('should export WorkflowInput type', () => {
      const input: WorkflowInput = {
        taskId: 'task-123',
        userId: 'user-456',
        userMessage: 'Test',
        agentSlug: 'test-agent',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      };

      expect(input).toBeDefined();
    });

    it('should export HitlStateType', () => {
      const hitlState: HitlStateType = {
        hitlStatus: 'waiting',
        hitlRequest: {
          taskId: 'task-123',
          threadId: 'thread-456',
          agentSlug: 'test-agent',
          userId: 'user-789',
          pendingContent: {},
          contentType: 'json',
        },
      };

      expect(hitlState).toBeDefined();
    });

    it('should export WorkflowMetadata type', () => {
      const metadata: WorkflowMetadata = {
        stepCount: 5,
        errors: [],
        currentStep: 'processing',
      };

      expect(metadata).toBeDefined();
    });

    it('should export BaseState type', () => {
      // BaseState is inferred from BaseStateAnnotation.State
      // Just verify it's a valid type
      const state: Partial<BaseState> = {
        taskId: 'task-123',
        userId: 'user-456',
        agentSlug: 'test-agent',
      };

      expect(state).toBeDefined();
    });
  });
});

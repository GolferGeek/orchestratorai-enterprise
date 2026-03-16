import { WorkflowResponseDto } from './workflow-response.dto';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

describe('WorkflowResponseDto', () => {
  describe('Structure and Field Types', () => {
    it('should create a valid WorkflowResponseDto with all required fields', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          result: 'Analysis complete',
          insights: ['insight1', 'insight2'],
        },
      };

      // Assert
      expect(response.success).toBe(true);
      expect(response.conversationId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(response.conversationId).toBe(
        '660e8400-e29b-41d4-a716-446655440001',
      );
      expect(response.data).toEqual({
        result: 'Analysis complete',
        insights: ['insight1', 'insight2'],
      });
    });

    it('should create a WorkflowResponseDto with success=false', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: false,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          error: 'Workflow execution failed',
          errorCode: 'WORKFLOW_ERROR',
        },
      };

      // Assert
      expect(response.success).toBe(false);
      expect(response.data.error).toBe('Workflow execution failed');
      expect(response.data.errorCode).toBe('WORKFLOW_ERROR');
    });

    it('should create a WorkflowResponseDto with empty data object', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {},
      };

      // Assert
      expect(response.success).toBe(true);
      expect(response.data).toEqual({});
    });
  });

  describe('Optional Metadata Field', () => {
    it('should create WorkflowResponseDto without metadata', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
      };

      // Assert
      expect(response.metadata).toBeUndefined();
    });

    it('should create WorkflowResponseDto with empty metadata', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        metadata: {},
      };

      // Assert
      expect(response.metadata).toEqual({});
    });

    it('should create WorkflowResponseDto with executionTime in metadata', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        metadata: {
          executionTime: 5000,
        },
      };

      // Assert
      expect(response.metadata?.executionTime).toBe(5000);
    });

    it('should create WorkflowResponseDto with stepsCompleted in metadata', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        metadata: {
          stepsCompleted: 42,
        },
      };

      // Assert
      expect(response.metadata?.stepsCompleted).toBe(42);
    });

    it('should create WorkflowResponseDto with provider in metadata', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        metadata: {
          provider: 'openai',
        },
      };

      // Assert
      expect(response.metadata?.provider).toBe('openai');
    });

    it('should create WorkflowResponseDto with model in metadata', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        metadata: {
          model: 'gpt-4',
        },
      };

      // Assert
      expect(response.metadata?.model).toBe('gpt-4');
    });

    it('should create WorkflowResponseDto with all metadata fields', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        metadata: {
          executionTime: 3500,
          stepsCompleted: 12,
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        },
      };

      // Assert
      expect(response.metadata?.executionTime).toBe(3500);
      expect(response.metadata?.stepsCompleted).toBe(12);
      expect(response.metadata?.provider).toBe('anthropic');
      expect(response.metadata?.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('Data Field Types', () => {
    it('should support string values in data', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          message: 'Hello, world!',
        },
      };

      // Assert
      expect(response.data.message).toBe('Hello, world!');
    });

    it('should support number values in data', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          count: 42,
          score: 98.5,
        },
      };

      // Assert
      expect(response.data.count).toBe(42);
      expect(response.data.score).toBe(98.5);
    });

    it('should support boolean values in data', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          isComplete: true,
          hasErrors: false,
        },
      };

      // Assert
      expect(response.data.isComplete).toBe(true);
      expect(response.data.hasErrors).toBe(false);
    });

    it('should support array values in data', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          items: ['item1', 'item2', 'item3'],
          numbers: [1, 2, 3, 4, 5],
        },
      };

      // Assert
      expect(response.data.items).toEqual(['item1', 'item2', 'item3']);
      expect(response.data.numbers).toEqual([1, 2, 3, 4, 5]);
    });

    it('should support nested objects in data', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          user: {
            id: 'user-123',
            name: 'John Doe',
            profile: {
              email: 'john@example.com',
              age: 30,
            },
          },
        },
      };

      // Assert
      expect(response.data.user).toEqual({
        id: 'user-123',
        name: 'John Doe',
        profile: {
          email: 'john@example.com',
          age: 30,
        },
      });
    });

    it('should support null values in data', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          result: null,
          optionalField: null,
        },
      };

      // Assert
      expect(response.data.result).toBeNull();
      expect(response.data.optionalField).toBeNull();
    });

    it('should support undefined values in data', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          result: undefined,
        },
      };

      // Assert
      expect(response.data.result).toBeUndefined();
    });
  });

  describe('Workflow-Specific Use Cases', () => {
    it('should create response for data analyst workflow', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          analysis: 'Sales increased by 15% in Q4',
          charts: [
            { type: 'bar', data: [1, 2, 3] },
            { type: 'line', data: [4, 5, 6] },
          ],
          insights: ['Peak sales on weekends', 'Product A most popular'],
        },
        metadata: {
          executionTime: 8500,
          stepsCompleted: 5,
          provider: 'openai',
          model: 'gpt-4',
        },
      };

      // Assert
      expect(response.success).toBe(true);
      expect(response.data.analysis).toBe('Sales increased by 15% in Q4');
      expect(response.data.charts).toHaveLength(2);
      expect(response.data.insights).toHaveLength(2);
      expect(response.metadata?.executionTime).toBe(8500);
    });

    it('should create response for marketing swarm workflow', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          outputs: [
            {
              id: 'output-1',
              content: 'Blog post content here...',
              writer: 'writer-creative',
              editor: 'editor-clarity',
              score: 8.5,
            },
            {
              id: 'output-2',
              content: 'Alternative blog post...',
              writer: 'writer-technical',
              editor: 'editor-seo',
              score: 7.8,
            },
          ],
          selectedOutputId: 'output-1',
        },
        metadata: {
          executionTime: 45000,
          stepsCompleted: 24,
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        },
      };

      // Assert
      expect(response.success).toBe(true);
      expect(response.data.outputs).toHaveLength(2);
      expect(response.data.selectedOutputId).toBe('output-1');
      expect(response.metadata?.executionTime).toBe(45000);
    });

    it('should create response for extended post writer workflow', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          blogPost: '# How to Use AI\n\nContent here...',
          seoDescription: 'Learn how to effectively use AI tools',
          targetAudience: 'developers',
          wordCount: 1500,
          sections: [
            { title: 'Introduction', wordCount: 200 },
            { title: 'Main Content', wordCount: 1100 },
            { title: 'Conclusion', wordCount: 200 },
          ],
        },
        metadata: {
          executionTime: 12000,
          stepsCompleted: 8,
          provider: 'openai',
          model: 'gpt-4-turbo',
        },
      };

      // Assert
      expect(response.success).toBe(true);
      expect(response.data.blogPost).toContain('# How to Use AI');
      expect(response.data.wordCount).toBe(1500);
      expect(response.data.sections).toHaveLength(3);
    });

    it('should create error response for failed workflow', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: false,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          error: 'Database connection failed',
          errorCode: 'DB_CONNECTION_ERROR',
          retryable: true,
          timestamp: '2025-12-28T10:30:00Z',
        },
        metadata: {
          executionTime: 1500,
          stepsCompleted: 2,
          provider: 'openai',
          model: 'gpt-4',
        },
      };

      // Assert
      expect(response.success).toBe(false);
      expect(response.data.error).toBe('Database connection failed');
      expect(response.data.errorCode).toBe('DB_CONNECTION_ERROR');
      expect(response.data.retryable).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large data objects', () => {
      // Arrange
      const largeData: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        largeData[`key${i}`] = `value${i}`;
      }

      // Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: largeData,
      };

      // Assert
      expect(Object.keys(response.data)).toHaveLength(1000);
      expect(response.data.key0).toBe('value0');
      expect(response.data.key999).toBe('value999');
    });

    it('should handle zero executionTime', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'instant' },
        metadata: {
          executionTime: 0,
        },
      };

      // Assert
      expect(response.metadata?.executionTime).toBe(0);
    });

    it('should handle very long executionTime', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'completed' },
        metadata: {
          executionTime: 3600000, // 1 hour in milliseconds
        },
      };

      // Assert
      expect(response.metadata?.executionTime).toBe(3600000);
    });

    it('should handle zero stepsCompleted', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: false,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { error: 'Failed at initialization' },
        metadata: {
          stepsCompleted: 0,
        },
      };

      // Assert
      expect(response.metadata?.stepsCompleted).toBe(0);
    });

    it('should handle special characters in string fields', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: {
          message: 'Special chars: <>&"\'{}[]',
          unicode: '🎉 Unicode works! 你好',
        },
      };

      // Assert
      expect(response.data.message).toBe('Special chars: <>&"\'{}[]');
      expect(response.data.unicode).toBe('🎉 Unicode works! 你好');
    });
  });

  describe('Serialization and Deserialization', () => {
    it('should serialize to JSON correctly', () => {
      // Arrange
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        metadata: {
          executionTime: 5000,
          stepsCompleted: 10,
        },
      };

      // Act
      const json = JSON.stringify(response);
      const parsed = JSON.parse(json);

      // Assert
      expect(parsed.success).toBe(true);
      expect(parsed.conversationId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(parsed.conversationId).toBe(
        '660e8400-e29b-41d4-a716-446655440001',
      );
      expect(parsed.data.result).toBe('success');
      expect(parsed.metadata.executionTime).toBe(5000);
      expect(parsed.metadata.stepsCompleted).toBe(10);
    });

    it('should deserialize from JSON correctly', () => {
      // Arrange
      const json = JSON.stringify({
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        metadata: {
          executionTime: 5000,
          provider: 'openai',
          model: 'gpt-4',
        },
      });

      // Act
      const response = JSON.parse(json) as WorkflowResponseDto;

      // Assert
      expect(response.success).toBe(true);
      expect(response.conversationId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(response.conversationId).toBe(
        '660e8400-e29b-41d4-a716-446655440001',
      );
      expect(response.data.result).toBe('success');
      expect(response.metadata?.executionTime).toBe(5000);
      expect(response.metadata?.provider).toBe('openai');
      expect(response.metadata?.model).toBe('gpt-4');
    });

    it('should handle undefined metadata in serialization', () => {
      // Arrange
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
      };

      // Act
      const json = JSON.stringify(response);
      const parsed = JSON.parse(json);

      // Assert
      expect(parsed.success).toBe(true);
      expect(parsed.metadata).toBeUndefined();
    });
  });

  describe('ExecutionContext Field', () => {
    const mockExecutionContext: ExecutionContext = {
      orgSlug: 'test-org',
      userId: 'user-123',
      conversationId: '660e8400-e29b-41d4-a716-446655440001',
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      planId: '770e8400-e29b-41d4-a716-446655440002',
      deliverableId: '880e8400-e29b-41d4-a716-446655440003',
      agentSlug: 'data-analyst',
      agentType: 'langgraph',
      provider: 'anthropic',
      model: 'claude-sonnet-4',
    };

    it('should create WorkflowResponseDto with ExecutionContext', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        context: mockExecutionContext,
      };

      // Assert
      expect(response.context).toBeDefined();
      expect(response.context).toEqual(mockExecutionContext);
      expect(response.context?.orgSlug).toBe('test-org');
      expect(response.context?.userId).toBe('user-123');
      expect(response.context?.conversationId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(response.context?.conversationId).toBe(
        '660e8400-e29b-41d4-a716-446655440001',
      );
    });

    it('should create WorkflowResponseDto without ExecutionContext (backward compatibility)', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
      };

      // Assert
      expect(response.context).toBeUndefined();
      expect(response.conversationId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(response.conversationId).toBe(
        '660e8400-e29b-41d4-a716-446655440001',
      );
    });

    it('should serialize ExecutionContext correctly', () => {
      // Arrange
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        context: mockExecutionContext,
      };

      // Act
      const json = JSON.stringify(response);
      const parsed = JSON.parse(json);

      // Assert
      expect(parsed.context).toBeDefined();
      expect(parsed.context.orgSlug).toBe('test-org');
      expect(parsed.context.userId).toBe('user-123');
      expect(parsed.context.conversationId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(parsed.context.provider).toBe('anthropic');
      expect(parsed.context.model).toBe('claude-sonnet-4');
    });

    it('should support ExecutionContext with planId and deliverableId', () => {
      // Arrange & Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'plan created' },
        context: {
          ...mockExecutionContext,
          planId: '770e8400-e29b-41d4-a716-446655440002',
          deliverableId: '880e8400-e29b-41d4-a716-446655440003',
        },
      };

      // Assert
      expect(response.context?.planId).toBe(
        '770e8400-e29b-41d4-a716-446655440002',
      );
      expect(response.context?.deliverableId).toBe(
        '880e8400-e29b-41d4-a716-446655440003',
      );
    });

    it('should support ExecutionContext with NIL_UUID for optional fields', () => {
      // Arrange
      const contextWithNilUuid: ExecutionContext = {
        ...mockExecutionContext,
        planId: '00000000-0000-0000-0000-000000000000',
        deliverableId: '00000000-0000-0000-0000-000000000000',
      };

      // Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        conversationId: '660e8400-e29b-41d4-a716-446655440001',
        data: { result: 'success' },
        context: contextWithNilUuid,
      };

      // Assert
      expect(response.context?.planId).toBe(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(response.context?.deliverableId).toBe(
        '00000000-0000-0000-0000-000000000000',
      );
    });

    it('should demonstrate context continuity pattern', () => {
      // Arrange - Simulate workflow response with updated context
      const updatedContext: ExecutionContext = {
        ...mockExecutionContext,
        planId: 'new-plan-id', // Backend updated planId
        deliverableId: 'new-deliverable-id', // Backend updated deliverableId
      };

      // Act
      const response: WorkflowResponseDto = {
        success: true,
        conversationId: mockExecutionContext.conversationId,
        conversationId: mockExecutionContext.conversationId,
        data: { result: 'Plan created successfully' },
        context: updatedContext, // Return updated context
      };

      // Assert - Frontend can use this to update executionContextStore
      expect(response.context?.planId).toBe('new-plan-id');
      expect(response.context?.deliverableId).toBe('new-deliverable-id');
      expect(response.context?.orgSlug).toBe(mockExecutionContext.orgSlug);
      expect(response.context?.userId).toBe(mockExecutionContext.userId);
    });
  });
});

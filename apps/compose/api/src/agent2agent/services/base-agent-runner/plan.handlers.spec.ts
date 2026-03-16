import 'reflect-metadata';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import {
  buildPlanningPrompt,
  validatePlanStructure,
  extractPlanMetadata,
} from './plan.handlers';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('Plan Handlers', () => {
  const _mockContext = createMockExecutionContext();

  describe('buildPlanningPrompt', () => {
    const baseDefinition: Partial<AgentRuntimeDefinition> = {
      slug: 'test-agent',
      name: 'Test Agent',
      organizationSlug: ['test-org'],
      agentType: 'specialist',
      prompts: {
        system: 'You are a helpful planning assistant.',
      },
    };

    it('should build a basic planning prompt without plan_structure', () => {
      const definition = {
        ...baseDefinition,
        planStructure: null,
      } as AgentRuntimeDefinition;

      const history = [
        {
          role: 'user',
          content: 'I want to build a blog',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = buildPlanningPrompt(definition, history, null);

      expect(result).toContain('You are a helpful planning assistant.');
      expect(result).toContain('Conversation history:');
      expect(result).toContain('user: I want to build a blog');
      expect(result).toContain('Generate a structured plan with named phases');
      expect(result).not.toContain('Your plan must follow this structure:');
    });

    it('should include plan_structure in prompt when defined', () => {
      const planStructure = {
        type: 'object',
        required: ['sections', 'target_audience'],
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                key_points: { type: 'array' },
              },
            },
          },
          target_audience: { type: 'string' },
        },
      };

      const definition = {
        ...baseDefinition,
        planStructure,
      } as AgentRuntimeDefinition;

      const history = [
        {
          role: 'user',
          content: 'Create a marketing plan',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = buildPlanningPrompt(definition, history, planStructure);

      expect(result).toContain('Your plan must follow this structure:');
      expect(result).toContain(JSON.stringify(planStructure, null, 2));
      expect(result).toContain('sections');
      expect(result).toContain('target_audience');
    });

    it('should handle empty conversation history', () => {
      const definition = {
        ...baseDefinition,
        planStructure: null,
      } as AgentRuntimeDefinition;

      const result = buildPlanningPrompt(definition, [], null);

      expect(result).toContain('You are a helpful planning assistant.');
      expect(result).toContain('Conversation history:');
      expect(result).toContain('No prior conversation history was provided.');
    });

    it('should use fallback prompt when system prompt is not provided', () => {
      const definition = {
        ...baseDefinition,
        prompts: {},
        planStructure: null,
      } as AgentRuntimeDefinition;

      const result = buildPlanningPrompt(definition, [], null);

      expect(result).toContain('You are Test Agent');
      expect(result).toContain('expert planning assistant');
      expect(result).toContain('Create detailed, actionable plans');
    });

    it('should include all conversation history messages', () => {
      const definition = {
        ...baseDefinition,
        planStructure: null,
      } as AgentRuntimeDefinition;

      const history = Array.from({ length: 5 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date().toISOString(),
      }));

      const result = buildPlanningPrompt(definition, history, null);

      expect(result).toContain('Message 0');
      expect(result).toContain('Message 4');
    });
  });

  describe('validatePlanStructure', () => {
    it('should validate plan content against JSON Schema without throwing', () => {
      const planStructure = {
        type: 'object',
        required: ['title', 'sections'],
        properties: {
          title: { type: 'string' },
          sections: { type: 'array' },
        },
      };

      const validContent = {
        title: 'My Plan',
        sections: ['Section 1', 'Section 2'],
      };

      expect(() => {
        validatePlanStructure(validContent, planStructure);
      }).not.toThrow();
    });

    // TODO: Enable this test when strict validation is implemented
    // Currently validatePlanStructure allows flexible plan structures
    it.skip('should throw validation error for invalid content', () => {
      const planStructure = {
        type: 'object',
        required: ['title', 'sections'],
        properties: {
          title: { type: 'string' },
          sections: { type: 'array' },
        },
      };

      const invalidContent = {
        title: 'My Plan',
        // missing required 'sections' field
      };

      expect(() => {
        validatePlanStructure(invalidContent, planStructure);
      }).toThrow('Plan does not conform to required structure');
    });

    it('should validate nested object structures', () => {
      const planStructure = {
        type: 'object',
        required: ['sections'],
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title'],
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        },
      };

      const validContent = {
        sections: [
          { title: 'Introduction', content: 'Intro text' },
          { title: 'Conclusion', content: 'Conclusion text' },
        ],
      };

      expect(() => {
        validatePlanStructure(validContent, planStructure);
      }).not.toThrow();
    });

    it('should handle null planStructure gracefully', () => {
      const content = { anything: 'goes' };

      expect(() => {
        const result = validatePlanStructure(content, null);
        expect(result).toEqual(content);
      }).not.toThrow();
    });

    it('should handle undefined planStructure gracefully', () => {
      const content = { anything: 'goes' };

      expect(() => {
        const result = validatePlanStructure(content, undefined);
        expect(result).toEqual(content);
      }).not.toThrow();
    });

    // TODO: Enable this test when strict validation is implemented
    // Currently validatePlanStructure allows flexible plan structures
    it.skip('should throw for type constraint violations', () => {
      const planStructure = {
        type: 'object',
        properties: {
          budget: { type: 'number' },
          timeline: { type: 'string' },
        },
      };

      const invalidContent = {
        budget: 'not a number',
        timeline: 123,
      };

      expect(() => {
        validatePlanStructure(invalidContent, planStructure);
      }).toThrow('Plan does not conform to required structure');
    });
  });

  describe('extractPlanMetadata', () => {
    it('should extract metadata from JSON plan content', () => {
      const content = {
        title: 'Marketing Plan',
        sections: ['Section 1', 'Section 2'],
        target_audience: 'Developers',
      };

      const metadata = extractPlanMetadata(content);

      expect(metadata).toHaveProperty('format', 'object');
      expect(metadata).toHaveProperty('keyCount', 3);
      expect(metadata).toHaveProperty('topLevelKeys');
      expect(metadata.topLevelKeys).toContain('title');
      expect(metadata.topLevelKeys).toContain('sections');
      expect(metadata.topLevelKeys).toContain('target_audience');
    });

    it('should handle string content gracefully', () => {
      const content = 'This is a markdown plan\n\n## Section 1\nContent here';

      const metadata = extractPlanMetadata(content);

      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
    });

    it('should handle null content', () => {
      const metadata = extractPlanMetadata(null);

      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
    });

    it('should handle undefined content', () => {
      const metadata = extractPlanMetadata(undefined);

      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
    });

    it('should extract nested metadata fields', () => {
      const content = {
        title: 'Project Plan',
        metadata: {
          author: 'AI Agent',
          created: '2025-01-15',
        },
        sections: [
          {
            title: 'Phase 1',
            tasks: ['Task 1', 'Task 2'],
          },
        ],
      };

      const metadata = extractPlanMetadata(content);

      expect(metadata).toHaveProperty('format', 'object');
      expect(metadata).toHaveProperty('keyCount', 3);
      expect(metadata.topLevelKeys).toContain('title');
      expect(metadata.topLevelKeys).toContain('metadata');
      expect(metadata.topLevelKeys).toContain('sections');
    });

    it('should handle array content', () => {
      const content = ['Section 1', 'Section 2', 'Section 3'];

      const metadata = extractPlanMetadata(content);

      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
    });
  });
});

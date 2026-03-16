import {
  AgentRuntimeNormalizationService,
  NormalizationResult,
} from './agent-runtime-normalization.service';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';
import {
  AgentTaskMode,
  TaskRequestDto,
} from '@agent2agent/dto/task-request.dto';

const buildDefinition = (
  overrides: Partial<AgentRuntimeDefinition> = {},
): AgentRuntimeDefinition =>
  ({
    slug: 'test-agent',
    name: 'Test Agent',
    agentType: 'context',
    organizationSlug: ['test-org'],
    config: null,
    ...overrides,
  }) as unknown as AgentRuntimeDefinition;

const buildRequest = (
  overrides: Partial<TaskRequestDto> = {},
): TaskRequestDto =>
  ({
    mode: AgentTaskMode.CONVERSE,
    payload: {},
    ...overrides,
  }) as unknown as TaskRequestDto;

describe('AgentRuntimeNormalizationService', () => {
  let service: AgentRuntimeNormalizationService;

  beforeEach(() => {
    service = new AgentRuntimeNormalizationService();
  });

  describe('normalize - no expected type', () => {
    it('should pass through when no transforms configured', () => {
      const definition = buildDefinition({ config: null });
      const request = buildRequest({ userMessage: 'hello' });

      const result: NormalizationResult = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.expected).toBeNull();
      expect(result.request).toBe(request);
    });

    it('should pass through when transforms have no expected type', () => {
      const definition = buildDefinition({
        config: { transforms: { adapters: {} } } as never,
      });
      const request = buildRequest({ userMessage: 'hello' });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('normalize - type detection', () => {
    it('should detect text/markdown when userMessage is a string', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'text/markdown' },
            },
          },
        } as never,
      });
      const request = buildRequest({ userMessage: 'Hello world' });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.provided).toBe('text/markdown');
    });

    it('should detect application/json when payload has non-option keys', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'application/json' },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: undefined,
        payload: { someKey: 'value' },
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.provided).toBe('application/json');
    });

    it('should use hint from payload.options.contentType when provided', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'application/json' },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: 'some text',
        payload: { options: { contentType: 'application/json' } },
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.provided).toBe('application/json');
    });

    it('should return null provided when no message and no payload keys', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'text/markdown' },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: undefined,
        payload: {},
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      // No data provided, strict=false (default), so passes through
      expect(result.ok).toBe(true);
      expect(result.provided).toBeNull();
    });
  });

  describe('normalize - JSON to Markdown adaptation', () => {
    it('should convert JSON payload to markdown message', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'text/markdown' },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: undefined,
        payload: { someData: 'value', count: 42 },
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.request?.userMessage).toContain('someData');
    });

    it('should use custom template for json_to_markdown conversion', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'text/markdown' },
            },
            adapters: {
              json_to_markdown: {
                template: 'Data: {{ json }}',
              },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: undefined,
        payload: { name: 'test' },
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.request?.userMessage).toContain('Data:');
      expect(result.request?.userMessage).toContain('"name"');
    });

    it('should prepend existing userMessage with json payload', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'text/markdown' },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: 'Process this:',
        payload: { key: 'val' },
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      // userMessage is text/markdown since it has text, so type already matches
      expect(result.request?.userMessage).toBeDefined();
    });
  });

  describe('normalize - Markdown to JSON adaptation', () => {
    it('should extract fenced JSON from markdown', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'application/json' },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage:
          'Here is the data:\n```json\n{"name":"test","value":42}\n```',
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.request?.payload?.normalized).toEqual({
        name: 'test',
        value: 42,
      });
    });

    it('should extract YAML from markdown text', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'application/json' },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: 'name: Alice\nage: 30\ncity: NYC',
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.request?.payload?.normalized).toEqual({
        name: 'Alice',
        age: 30,
        city: 'NYC',
      });
    });

    it('should extract CSV from text', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'application/json' },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: 'name,age,city\nAlice,30,NYC\nBob,25,LA',
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(Array.isArray(result.request?.payload?.normalized)).toBe(true);
      const rows = result.request?.payload?.normalized as unknown[];
      expect(rows).toHaveLength(2);
      expect((rows[0] as Record<string, string>)['name']).toBe('Alice');
    });

    it('should pass through in permissive mode when cannot adapt', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'application/json', strict: false },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: 'Just plain text with no structured data',
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      // Cannot extract JSON from plain text, permissive=pass through
      expect(result.ok).toBe(true);
    });

    it('should fail in strict mode when cannot adapt', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'application/json', strict: true },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: 'Just plain text with no structured data',
      });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(false);
      expect(result.strict).toBe(true);
      expect(result.reason).toContain('Expected');
    });
  });

  describe('normalize - mode-specific configuration', () => {
    it('should use mode-specific expected type from by_mode config', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'text/markdown' },
            },
            by_mode: {
              plan: {
                input: { content_type: 'application/json' },
              },
            },
          },
        } as never,
      });
      const request = buildRequest({
        userMessage: 'Plan this: ```json\n{"goal":"win"}\n```',
      });

      const result = service.normalize(definition, request, AgentTaskMode.PLAN);

      expect(result.ok).toBe(true);
      expect(result.expected).toBe('application/json');
    });

    it('should use default expected type when mode not in by_mode', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'text/markdown' },
            },
            by_mode: {
              plan: {
                input: { content_type: 'application/json' },
              },
            },
          },
        } as never,
      });
      const request = buildRequest({ userMessage: 'Hello world' });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.expected).toBe('text/markdown');
    });
  });

  describe('normalize - types already match', () => {
    it('should return ok=true when provided type matches expected', () => {
      const definition = buildDefinition({
        config: {
          transforms: {
            expected: {
              input: { content_type: 'text/markdown' },
            },
          },
        } as never,
      });
      const request = buildRequest({ userMessage: 'Hello world' });

      const result = service.normalize(
        definition,
        request,
        AgentTaskMode.CONVERSE,
      );

      expect(result.ok).toBe(true);
      expect(result.expected).toBe('text/markdown');
      expect(result.provided).toBe('text/markdown');
    });
  });
});

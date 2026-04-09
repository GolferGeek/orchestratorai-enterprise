/**
 * Unit tests for OllamaLLMService vision/image path.
 *
 * Covers the branch inside generateResponse that routes to /api/chat when
 * params.images is non-empty, versus the existing /api/generate path when
 * no images are supplied.
 *
 * Strategy: uses provider='ollama-cloud' so ensureModelLoaded() is skipped,
 * keeping mock setup minimal. All external HTTP calls are mocked via
 * httpService.post / httpService.get.
 */

import { of, throwError } from 'rxjs';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { OllamaLLMService } from '../services/ollama-llm.service';
import {
  GenerateResponseParams,
  LLMServiceConfig,
  LLMRequestOptions,
} from '../services/llm-interfaces';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCloudConfig(overrides: Partial<LLMServiceConfig> = {}): LLMServiceConfig {
  return {
    provider: 'ollama-cloud',
    model: 'llava:7b',
    temperature: 0,
    maxTokens: 512,
    baseUrl: 'http://test-ollama:11434',
    ...overrides,
  };
}

function makeOptions(): LLMRequestOptions {
  return {
    executionContext: createMockExecutionContext({
      orgSlug: 'test-org',
      userId: 'user-1',
      conversationId: 'conv-1',
      provider: 'ollama-cloud',
      model: 'llava:7b',
    }),
  };
}

/** Minimal /api/chat response shape */
function makeChatHttpResponse(content: string) {
  return {
    data: {
      model: 'llava:7b',
      message: { role: 'assistant', content },
      done: true,
      prompt_eval_count: 10,
      eval_count: 20,
      total_duration: 1000000,
      load_duration: 500000,
      prompt_eval_duration: 200000,
      eval_duration: 300000,
    },
  };
}

/** Minimal /api/generate response shape (must satisfy ollamaResponseSchema) */
function makeGenerateHttpResponse(response: string) {
  return {
    data: {
      model: 'llava:7b',
      response,
      done: true,
      created_at: new Date().toISOString(),
      prompt_eval_count: 8,
      eval_count: 15,
      total_duration: 800000,
    },
  };
}

/**
 * Loose interface exposing BaseLLMService protected methods we need to stub.
 * Casting service through this type lets us mock without ts-ignore.
 */
interface OllamaServiceTestHandle {
  handlePiiInput: (text: string, opts?: unknown) => Promise<{ processedText: string }>;
  handlePiiOutput: (text: string, id: string) => Promise<string>;
  trackUsage: (...args: unknown[]) => Promise<void>;
  logRequestResponse: (...args: unknown[]) => void;
  generateRequestId: (prefix: string) => string;
}

/** Build a service instance with injected mocks */
function buildService(httpServiceMock: Record<string, jest.Mock>): OllamaLLMService {
  const config = makeCloudConfig();

  const service = new OllamaLLMService(
    config,
    {} as never,  // PIIService — not called (enablePseudonymization=false)
    {} as never,  // DictionaryPseudonymizerService — not called
    {} as never,  // RunMetadataService — not called in generateResponse
    {} as never,  // ProviderConfigService — not called in validateConfig for ollama
    httpServiceMock as never,
  );

  // Cast through the test handle interface to stub protected/private methods
  const handle = service as unknown as OllamaServiceTestHandle;

  jest
    .spyOn(handle, 'handlePiiInput')
    .mockImplementation(async (text: string) => ({ processedText: text }));

  jest
    .spyOn(handle, 'handlePiiOutput')
    .mockImplementation(async (text: string) => text);

  jest
    .spyOn(handle, 'trackUsage')
    .mockResolvedValue(undefined);

  jest
    .spyOn(handle, 'logRequestResponse')
    .mockReturnValue(undefined);

  jest
    .spyOn(handle, 'generateRequestId')
    .mockReturnValue('req-test-001');

  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OllamaLLMService — vision / image path', () => {
  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-1',
    conversationId: 'conv-1',
    provider: 'ollama-cloud',
    model: 'llava:7b',
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Routes to /api/chat when images are present
  // -------------------------------------------------------------------------
  it('routes to /api/chat endpoint when images are provided', async () => {
    const postMock = jest.fn().mockReturnValue(
      of(makeChatHttpResponse('The image shows a cat.')),
    );
    const service = buildService({ post: postMock });

    const params: GenerateResponseParams = {
      systemPrompt: 'Describe the image.',
      userMessage: 'What is this?',
      images: [{ base64: 'abc123', mimeType: 'image/jpeg' }],
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    await service.generateResponse(mockContext, params);

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url] = postMock.mock.calls[0] as [string, ...unknown[]];
    expect(url).toBe('http://test-ollama:11434/api/chat');
  });

  // -------------------------------------------------------------------------
  // 2. Includes images array on the user message when routing to /api/chat
  // -------------------------------------------------------------------------
  it('attaches base64 images to the user message in the /api/chat request body', async () => {
    const postMock = jest.fn().mockReturnValue(
      of(makeChatHttpResponse('A landscape.')),
    );
    const service = buildService({ post: postMock });

    const params: GenerateResponseParams = {
      systemPrompt: 'You are a vision model.',
      userMessage: 'Describe this scene.',
      images: [
        { base64: 'base64img1', mimeType: 'image/png' },
        { base64: 'base64img2', mimeType: 'image/png' },
      ],
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    await service.generateResponse(mockContext, params);

    const [, requestBody] = postMock.mock.calls[0] as [string, Record<string, unknown>, ...unknown[]];
    const messages = requestBody.messages as Array<{
      role: string;
      content: string;
      images?: string[];
    }>;

    // There must be a user message with the images array
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.images).toEqual(['base64img1', 'base64img2']);
  });

  // -------------------------------------------------------------------------
  // 3. Routes to /api/generate when no images are provided
  // -------------------------------------------------------------------------
  it('routes to /api/generate endpoint when no images are provided', async () => {
    const postMock = jest.fn().mockReturnValue(
      of(makeGenerateHttpResponse('Hello from text path.')),
    );
    const service = buildService({ post: postMock });

    const params: GenerateResponseParams = {
      systemPrompt: 'You are helpful.',
      userMessage: 'Tell me something.',
      // images intentionally absent
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    await service.generateResponse(mockContext, params);

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url] = postMock.mock.calls[0] as [string, ...unknown[]];
    expect(url).toBe('http://test-ollama:11434/api/generate');
  });

  // -------------------------------------------------------------------------
  // 4. Returns extracted text from the /api/chat message.content field
  // -------------------------------------------------------------------------
  it('extracts content from chatData.message.content for the LLMResponse', async () => {
    const expectedText = 'The photo shows a mountain trail.';
    const postMock = jest.fn().mockReturnValue(
      of(makeChatHttpResponse(expectedText)),
    );
    const service = buildService({ post: postMock });

    const params: GenerateResponseParams = {
      systemPrompt: 'Describe images.',
      userMessage: 'What do you see?',
      images: [{ base64: 'imgdata', mimeType: 'image/jpeg' }],
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    const result = await service.generateResponse(mockContext, params);

    expect(result.content).toBe(expectedText);
    expect(result.metadata.provider).toBe('ollama');
    expect(result.metadata.model).toBe('llava:7b');
    expect(result.metadata.status).toBe('completed');
  });

  // -------------------------------------------------------------------------
  // 5. Empty images array treats as no-images case (routes to /api/generate)
  // -------------------------------------------------------------------------
  it('treats an empty images array as the text-only path (/api/generate)', async () => {
    const postMock = jest.fn().mockReturnValue(
      of(makeGenerateHttpResponse('Text-only response.')),
    );
    const service = buildService({ post: postMock });

    const params: GenerateResponseParams = {
      systemPrompt: 'You are helpful.',
      userMessage: 'Say something.',
      images: [], // explicitly empty — must not trigger vision branch
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    await service.generateResponse(mockContext, params);

    const [url] = postMock.mock.calls[0] as [string, ...unknown[]];
    expect(url).toBe('http://test-ollama:11434/api/generate');
  });

  // -------------------------------------------------------------------------
  // 6. Vision path propagates Ollama HTTP error
  // -------------------------------------------------------------------------
  it('throws when the /api/chat call returns an error', async () => {
    const ollamaError = Object.assign(new Error('Ollama HTTP 500'), {
      response: { status: 500, data: { error: 'Internal server error' } },
    });

    const postMock = jest.fn().mockReturnValue(throwError(() => ollamaError));
    const service = buildService({ post: postMock });

    const params: GenerateResponseParams = {
      systemPrompt: 'Describe this.',
      userMessage: 'What is it?',
      images: [{ base64: 'badimage', mimeType: 'image/jpeg' }],
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    await expect(service.generateResponse(mockContext, params)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Extra: system prompt is included as a separate message in /api/chat body
  // -------------------------------------------------------------------------
  it('includes system prompt as a system-role message in /api/chat', async () => {
    const postMock = jest.fn().mockReturnValue(
      of(makeChatHttpResponse('Acknowledged.')),
    );
    const service = buildService({ post: postMock });

    const params: GenerateResponseParams = {
      systemPrompt: 'You are a vision assistant.',
      userMessage: 'What is this object?',
      images: [{ base64: 'someimg', mimeType: 'image/png' }],
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    await service.generateResponse(mockContext, params);

    const [, requestBody] = postMock.mock.calls[0] as [string, Record<string, unknown>, ...unknown[]];
    const messages = requestBody.messages as Array<{ role: string; content: string }>;

    const systemMsg = messages.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toBe('You are a vision assistant.');
  });

  // -------------------------------------------------------------------------
  // Extra: /api/chat request body has stream: false
  // -------------------------------------------------------------------------
  it('sends stream: false in the /api/chat request body', async () => {
    const postMock = jest.fn().mockReturnValue(
      of(makeChatHttpResponse('ok.')),
    );
    const service = buildService({ post: postMock });

    const params: GenerateResponseParams = {
      systemPrompt: 'Vision model.',
      userMessage: 'Describe.',
      images: [{ base64: 'x', mimeType: 'image/jpeg' }],
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    await service.generateResponse(mockContext, params);

    const [, requestBody] = postMock.mock.calls[0] as [string, Record<string, unknown>, ...unknown[]];
    expect(requestBody.stream).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Extra: ExecutionContext flows through to trackUsage
  // -------------------------------------------------------------------------
  it('passes ExecutionContext to trackUsage after a successful vision call', async () => {
    const postMock = jest.fn().mockReturnValue(
      of(makeChatHttpResponse('A building.')),
    );
    const service = buildService({ post: postMock });

    // Access the already-mocked trackUsage spy via the test handle interface
    const handle = service as unknown as OllamaServiceTestHandle;
    const trackUsageSpy = jest
      .spyOn(handle, 'trackUsage')
      .mockResolvedValue(undefined);

    const params: GenerateResponseParams = {
      systemPrompt: 'Describe.',
      userMessage: 'What building?',
      images: [{ base64: 'imgx', mimeType: 'image/jpeg' }],
      config: makeCloudConfig(),
      options: makeOptions(),
    };

    await service.generateResponse(mockContext, params);

    expect(trackUsageSpy).toHaveBeenCalledWith(
      mockContext,
      expect.any(String), // provider
      expect.any(String), // model
      expect.any(Number), // inputTokens
      expect.any(Number), // outputTokens
      expect.any(Number), // cost
      expect.any(Object), // metadata
    );
  });
});

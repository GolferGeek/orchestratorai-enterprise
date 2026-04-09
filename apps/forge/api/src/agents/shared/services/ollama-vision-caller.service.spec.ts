import { Test, TestingModule } from '@nestjs/testing';
import { OllamaVisionCaller } from './ollama-vision-caller.service';
import { LLM_SERVICE } from '@orchestratorai/planes/llm';
import type { LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { VisionExecutionContext } from '@orchestratorai/planes/extractors';

/**
 * Unit tests for OllamaVisionCaller
 *
 * Verifies the service routes vision/image analysis through LLM_SERVICE
 * (the LLM plane) rather than making direct HTTP calls to Ollama.
 *
 * Key invariants:
 *  - Provider guard: only 'ollama' is accepted
 *  - Images array is passed when a base64Image is present
 *  - ExecutionContext is constructed from VisionExecutionContext + explicit provider/model
 *  - Both string and LLMResponse object return shapes are handled
 *  - Errors from LLM_SERVICE propagate without suppression (NO FALLBACKS)
 */
describe('OllamaVisionCaller', () => {
  let service: OllamaVisionCaller;
  let mockLlmService: jest.Mocked<Pick<LLMServiceProvider, 'generateResponse'>>;

  const makeVisionContext = (
    overrides: Partial<VisionExecutionContext> = {},
  ): VisionExecutionContext => ({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-456',
    agentSlug: 'vision-agent',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'llava:7b',
    sovereignMode: false,
    ...overrides,
  });

  const baseArgs = {
    systemPrompt: 'You are a vision assistant.',
    userPrompt: 'Describe this image.',
    base64Image: 'aGVsbG8=', // base64 for "hello"
    mimeType: 'image/jpeg',
    provider: 'ollama',
    model: 'llava:7b',
    context: makeVisionContext(),
  };

  beforeEach(async () => {
    mockLlmService = {
      generateResponse: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OllamaVisionCaller,
        {
          provide: LLM_SERVICE,
          useValue: mockLlmService,
        },
      ],
    }).compile();

    service = module.get<OllamaVisionCaller>(OllamaVisionCaller);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Injection ────────────────────────────────────────────────────────────

  it('should be defined (LLM_SERVICE injected correctly)', () => {
    expect(service).toBeDefined();
  });

  // ── 2. Provider guard ───────────────────────────────────────────────────────

  it('should throw when provider is not ollama', async () => {
    const args = { ...baseArgs, provider: 'anthropic' };

    await expect(service.callVisionModel(args)).rejects.toThrow(
      "OllamaVisionCaller can only handle provider='ollama'; got provider='anthropic'",
    );

    expect(mockLlmService.generateResponse).not.toHaveBeenCalled();
  });

  it('should throw with the exact provider name in the error message', async () => {
    const args = { ...baseArgs, provider: 'openai' };

    await expect(service.callVisionModel(args)).rejects.toThrow(
      "provider='openai'",
    );
  });

  // ── 3. Images array is passed to LLM_SERVICE ────────────────────────────────

  it('should call generateResponse with images array containing base64Image and mimeType', async () => {
    mockLlmService.generateResponse.mockResolvedValue('A red apple on a table.');

    await service.callVisionModel(baseArgs);

    expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
      baseArgs.systemPrompt,
      baseArgs.userPrompt,
      expect.objectContaining({
        images: [{ base64: baseArgs.base64Image, mimeType: baseArgs.mimeType }],
      }),
    );
  });

  it('should pass temperature: 0 and callerType: agent to LLM_SERVICE', async () => {
    mockLlmService.generateResponse.mockResolvedValue('result');

    await service.callVisionModel(baseArgs);

    expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        temperature: 0,
        callerType: 'agent',
        callerName: 'ollama-vision-caller',
      }),
    );
  });

  // ── 4. ExecutionContext construction ────────────────────────────────────────

  it('should pass a correctly-shaped ExecutionContext derived from VisionExecutionContext', async () => {
    const context = makeVisionContext({
      orgSlug: 'acme',
      userId: 'u-999',
      conversationId: 'c-888',
      agentSlug: 'my-vision-agent',
      agentType: 'langgraph',
      sovereignMode: true,
    });

    mockLlmService.generateResponse.mockResolvedValue('ok');

    await service.callVisionModel({ ...baseArgs, context, model: 'llava:13b' });

    expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        executionContext: {
          orgSlug: 'acme',
          userId: 'u-999',
          conversationId: 'c-888',
          agentSlug: 'my-vision-agent',
          agentType: 'langgraph',
          provider: 'ollama',  // comes from args.provider, not context.provider
          model: 'llava:13b',  // comes from args.model
          sovereignMode: true,
        },
      }),
    );
  });

  it('should use args.provider and args.model in ExecutionContext, not context.provider/model', async () => {
    // VisionExecutionContext.provider/model may differ from the explicit args;
    // the service must use args.provider and args.model for the ExecutionContext.
    const context = makeVisionContext({ provider: 'some-other', model: 'some-other-model' });
    mockLlmService.generateResponse.mockResolvedValue('result');

    await service.callVisionModel({
      ...baseArgs,
      context,
      provider: 'ollama',
      model: 'llava:7b',
    });

    expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        executionContext: expect.objectContaining({
          provider: 'ollama',
          model: 'llava:7b',
        }),
      }),
    );
  });

  // ── 5. Correct model parameter forwarded ────────────────────────────────────

  it('should pass the correct model in ExecutionContext when model changes', async () => {
    mockLlmService.generateResponse.mockResolvedValue('vision analysis');

    await service.callVisionModel({ ...baseArgs, model: 'llava:34b' });

    expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        executionContext: expect.objectContaining({ model: 'llava:34b' }),
      }),
    );
  });

  // ── 6. Return value — string response ───────────────────────────────────────

  it('should return the string content when LLM_SERVICE returns a plain string', async () => {
    mockLlmService.generateResponse.mockResolvedValue('This is a cat.');

    const result = await service.callVisionModel(baseArgs);

    expect(result).toEqual({ text: 'This is a cat.' });
  });

  // ── 7. Return value — LLMResponse object ────────────────────────────────────

  it('should return text from LLMResponse.content when LLM_SERVICE returns an LLMResponse object', async () => {
    // Cast to unknown first to avoid needing a fully-shaped ResponseMetadata in tests.
    // The service does `(result as LLMResponse).content` so only `.content` matters at runtime.
    const llmResponse = {
      content: 'A detailed description of the scene.',
    } as unknown as Awaited<ReturnType<LLMServiceProvider['generateResponse']>>;
    mockLlmService.generateResponse.mockResolvedValue(llmResponse);

    const result = await service.callVisionModel(baseArgs);

    expect(result).toEqual({ text: 'A detailed description of the scene.' });
  });

  // ── 8. Error propagation — NO FALLBACKS ─────────────────────────────────────

  it('should propagate LLM service errors without swallowing them', async () => {
    mockLlmService.generateResponse.mockRejectedValue(
      new Error('Ollama connection refused'),
    );

    await expect(service.callVisionModel(baseArgs)).rejects.toThrow(
      'Ollama connection refused',
    );
  });

  it('should propagate non-Error LLM rejections', async () => {
    mockLlmService.generateResponse.mockRejectedValue('network timeout');

    await expect(service.callVisionModel(baseArgs)).rejects.toBe(
      'network timeout',
    );
  });

  // ── 9. System and user prompts forwarded correctly ──────────────────────────

  it('should forward systemPrompt and userPrompt verbatim to LLM_SERVICE', async () => {
    const systemPrompt = 'You are an expert medical imaging analyst.';
    const userPrompt = 'Identify any abnormalities in the X-ray.';
    mockLlmService.generateResponse.mockResolvedValue('No abnormalities found.');

    await service.callVisionModel({ ...baseArgs, systemPrompt, userPrompt });

    expect(mockLlmService.generateResponse).toHaveBeenCalledWith(
      systemPrompt,
      userPrompt,
      expect.any(Object),
    );
  });
});

import { BlindedLLMService } from '../blinded-llm.service';
import { SourceBlindingService } from '../source-blinding.service';
import { ProviderConfigService } from '../provider-config.service';

function makeService(overrides?: {
  getEnhancedProviderConfig?: jest.Mock;
  createBlindedHttpClient?: jest.Mock;
  getStats?: jest.Mock;
}) {
  const mockBlindedClient = {
    post: jest.fn().mockResolvedValue({
      data: { choices: [{ message: { content: 'test response' } }] },
      status: 200,
      statusText: 'OK',
      headers: {},
    }),
  };

  const sourceBlindingService = {
    createBlindedHttpClient:
      overrides?.createBlindedHttpClient ??
      jest.fn().mockReturnValue(mockBlindedClient),
    getStats:
      overrides?.getStats ??
      jest.fn().mockReturnValue({
        requestCount: 0,
        blindingEnabled: true,
        supportedProviders: ['openai', 'anthropic', 'google'],
      }),
  } as unknown as SourceBlindingService;

  const defaultProviderConfig = {
    name: 'openai',
    apiKey: 'sk-test-key',
    baseUrl: 'https://api.openai.com/v1',
    features: {
      supportsNoTrain: true,
      supportsNoRetain: false,
      supportsStreaming: true,
      supportsFunctions: true,
    },
    defaultHeaders: {},
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  const providerConfigService = {
    getEnhancedProviderConfig:
      overrides?.getEnhancedProviderConfig ??
      jest.fn().mockReturnValue(defaultProviderConfig),
  } as unknown as ProviderConfigService;

  const service = new BlindedLLMService(
    sourceBlindingService,
    providerConfigService,
  );
  return {
    service,
    sourceBlindingService,
    providerConfigService,
    mockBlindedClient,
  };
}

describe('BlindedLLMService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBlindedLLM', () => {
    it('should throw when provider config is not found', () => {
      const { service } = makeService({
        getEnhancedProviderConfig: jest.fn().mockReturnValue(null),
      });

      expect(() =>
        service.createBlindedLLM({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      ).toThrow('Provider configuration not found: openai');
    });

    it('should throw for openai provider when model is not specified', () => {
      const { service } = makeService();

      expect(() =>
        service.createBlindedLLM({
          provider: 'openai',
          // model intentionally omitted
        }),
      ).toThrow('OpenAI model must be explicitly specified');
    });

    it('should throw for anthropic provider when model is not specified', () => {
      const mockProviderConfig = {
        name: 'anthropic',
        apiKey: 'sk-ant-test',
        baseUrl: 'https://api.anthropic.com',
        features: {
          supportsNoTrain: false,
          supportsNoRetain: false,
          supportsStreaming: true,
          supportsFunctions: false,
        },
        defaultHeaders: {},
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      };

      const { service } = makeService({
        getEnhancedProviderConfig: jest
          .fn()
          .mockReturnValue(mockProviderConfig),
      });

      expect(() =>
        service.createBlindedLLM({
          provider: 'anthropic',
          // model intentionally omitted
        }),
      ).toThrow('Anthropic model must be explicitly specified');
    });

    it('should throw for google provider when model is not specified', () => {
      const mockProviderConfig = {
        name: 'google',
        apiKey: 'google-test-key',
        baseUrl: 'https://generativelanguage.googleapis.com',
        features: {
          supportsNoTrain: false,
          supportsNoRetain: false,
          supportsStreaming: true,
          supportsFunctions: false,
        },
        defaultHeaders: {},
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      };

      const { service } = makeService({
        getEnhancedProviderConfig: jest
          .fn()
          .mockReturnValue(mockProviderConfig),
      });

      expect(() =>
        service.createBlindedLLM({
          provider: 'google',
          // model intentionally omitted
        }),
      ).toThrow('Google model must be explicitly specified');
    });

    it('should throw for unsupported provider', () => {
      const { service } = makeService();

      expect(() =>
        service.createBlindedLLM({
          provider: 'unknown-provider' as 'openai',
          model: 'some-model',
        }),
      ).toThrow('Unsupported provider');
    });

    it('should return a BaseChatModel for openai with valid config', () => {
      const { service } = makeService();

      const llm = service.createBlindedLLM({
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 1000,
        sourceBlindingOptions: {
          policyProfile: 'standard',
          dataClass: 'public',
          sovereignMode: 'false',
          noTrain: true,
          noRetain: false,
        },
      });

      // Should return an object with LLM characteristics (Proxy wrapping)
      expect(llm).toBeDefined();
      expect(typeof llm).toBe('object');
    });

    it('should call createBlindedHttpClient with correct provider', () => {
      const mockCreateBlindedHttpClient = jest.fn().mockReturnValue({
        post: jest.fn(),
      });

      const { service } = makeService({
        createBlindedHttpClient: mockCreateBlindedHttpClient,
      });

      service.createBlindedLLM({
        provider: 'openai',
        model: 'gpt-4o',
      });

      expect(mockCreateBlindedHttpClient).toHaveBeenCalledWith(
        'openai',
        expect.objectContaining({ provider: 'openai' }),
      );
    });

    it('should pass noTrain from providerConfig when not specified in options', () => {
      const mockCreateBlindedHttpClient = jest
        .fn()
        .mockReturnValue({ post: jest.fn() });
      const mockGetEnhancedProviderConfig = jest.fn().mockReturnValue({
        name: 'openai',
        apiKey: 'key',
        baseUrl: 'https://api.openai.com/v1',
        features: {
          supportsNoTrain: true, // should be used as noTrain default
          supportsNoRetain: false,
          supportsStreaming: true,
          supportsFunctions: true,
        },
        defaultHeaders: {},
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      });

      const { service } = makeService({
        createBlindedHttpClient: mockCreateBlindedHttpClient,
        getEnhancedProviderConfig: mockGetEnhancedProviderConfig,
      });

      service.createBlindedLLM({
        provider: 'openai',
        model: 'gpt-4o',
        // no sourceBlindingOptions
      });

      expect(mockCreateBlindedHttpClient).toHaveBeenCalledWith(
        'openai',
        expect.objectContaining({ noTrain: true }), // from providerConfig.features.supportsNoTrain
      );
    });
  });

  describe('createBlindedLLMs', () => {
    it('should create LLMs for all three providers', () => {
      const mockProviderConfig = {
        name: 'provider',
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com',
        features: {
          supportsNoTrain: false,
          supportsNoRetain: false,
          supportsStreaming: true,
          supportsFunctions: false,
        },
        defaultHeaders: {},
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      };

      const { service } = makeService({
        getEnhancedProviderConfig: jest
          .fn()
          .mockReturnValue(mockProviderConfig),
      });

      const llms = service.createBlindedLLMs({
        model: 'test-model',
        temperature: 0.7,
      });

      expect(llms.openai).toBeDefined();
      expect(llms.anthropic).toBeDefined();
      expect(llms.google).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return stats with supportedProviders and sourceBlindingEnabled', () => {
      const mockGetStats = jest.fn().mockReturnValue({
        requestCount: 5,
        blindingEnabled: true,
      });

      const { service } = makeService({ getStats: mockGetStats });

      const stats = service.getStats();

      expect(stats.supportedProviders).toEqual([
        'openai',
        'anthropic',
        'google',
      ]);
      expect(stats.sourceBlindingEnabled).toBe(true);
      expect(stats.blindingService).toBeDefined();
      expect(mockGetStats).toHaveBeenCalledTimes(1);
    });
  });

  describe('testSourceBlinding', () => {
    it('should return success=false when createBlindedLLM throws', async () => {
      const { service } = makeService({
        getEnhancedProviderConfig: jest.fn().mockReturnValue(null),
      });

      const result = await service.testSourceBlinding('openai');

      expect(result.success).toBe(false);
      expect(result.blindingApplied).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });
});

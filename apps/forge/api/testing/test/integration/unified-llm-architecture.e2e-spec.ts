import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { LLMService } from '../../../src/llms/llm.service';
import { LLMServiceFactory } from '../../../src/llms/services/llm-service-factory';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

// Test execution context for LLM calls
const TEST_EXECUTION_CONTEXT: ExecutionContext = {
  orgSlug: 'demo-org',
  agentSlug: 'test-agent',
  agentType: 'context',
  userId: '00000000-0000-0000-0000-000000000000',
  conversationId: '00000000-0000-0000-0000-000000000000',
  taskId: '00000000-0000-0000-0000-000000000000',
  planId: '00000000-0000-0000-0000-000000000000',
  deliverableId: '00000000-0000-0000-0000-000000000000',
  provider: 'ollama',
  model: 'llama3.2:1b',
};

describe('Unified LLM Architecture (e2e)', () => {
  let app: INestApplication;
  let llmService: LLMService;
  let llmServiceFactory: LLMServiceFactory;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    llmService = moduleFixture.get<LLMService>(LLMService);
    llmServiceFactory = moduleFixture.get<LLMServiceFactory>(LLMServiceFactory);
    await app.init();
  }, 120000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('generateUnifiedResponse Method', () => {
    it('should generate response with Ollama using unified method', async () => {
      console.log('🧪 Testing unified method with Ollama...');
      
      const result = await llmService.generateUnifiedResponse({
        provider: 'ollama',
        model: 'llama3.2:1b',
        systemPrompt: 'You are a helpful assistant. Be concise.',
        userMessage: 'What is 2 + 2? Answer in one sentence.',
        options: {
          temperature: 0.1,
          maxTokens: 50,
          callerType: 'test',
          callerName: 'unified-architecture-test',
          dataClassification: 'internal',
          executionContext: TEST_EXECUTION_CONTEXT,
        }
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      // Type guard: when includeMetadata is not specified or false, result is a string
      if (typeof result === 'string') {
        expect(result.length).toBeGreaterThan(0);
        console.log('✅ Unified Ollama response:', result.substring(0, 100) + '...');
      } else {
        throw new Error('Expected string result but got LLMResponse object');
      }
    }, 30000);

    it('should return metadata when includeMetadata is true', async () => {
      console.log('🧪 Testing unified method with metadata...');
      
      const result = await llmService.generateUnifiedResponse({
        provider: 'ollama',
        model: 'llama3.2:1b',
        systemPrompt: 'You are a helpful assistant.',
        userMessage: 'Count to 3.',
        options: {
          temperature: 0.1,
          includeMetadata: true,
          callerType: 'test',
          callerName: 'unified-metadata-test',
          executionContext: TEST_EXECUTION_CONTEXT,
        }
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      
      // Type assertion since we know it's an LLMResponse when includeMetadata is true
      const responseWithMetadata = result as any; // Using any to handle the LLMResponse type
      expect(responseWithMetadata.content).toBeDefined();
      expect(responseWithMetadata.metadata).toBeDefined();
      expect(responseWithMetadata.metadata.provider).toBe('ollama');
      expect(responseWithMetadata.metadata.model).toBe('llama3.2:1b');
      expect(responseWithMetadata.metadata.usage).toBeDefined();
      expect(responseWithMetadata.metadata.usage.inputTokens).toBeGreaterThan(0);
      expect(responseWithMetadata.metadata.usage.outputTokens).toBeGreaterThan(0);
      expect(responseWithMetadata.metadata.timing).toBeDefined();
      expect(responseWithMetadata.metadata.timing.duration).toBeGreaterThan(0);
      
      console.log('✅ Unified metadata response:', {
        content: responseWithMetadata.content.substring(0, 50) + '...',
        provider: responseWithMetadata.metadata.provider,
        model: responseWithMetadata.metadata.model,
        inputTokens: responseWithMetadata.metadata.usage.inputTokens,
        outputTokens: responseWithMetadata.metadata.usage.outputTokens,
        duration: responseWithMetadata.metadata.timing.duration + 'ms'
      });
    }, 30000);

    it('should validate required parameters', async () => {
      console.log('🧪 Testing parameter validation...');
      
      await expect(
        llmService.generateUnifiedResponse({
          provider: '',
          model: 'llama3.2:1b',
          systemPrompt: 'Test',
          userMessage: 'Test',
        })
      ).rejects.toThrow('provider is required');

      await expect(
        llmService.generateUnifiedResponse({
          provider: 'ollama',
          model: '',
          systemPrompt: 'Test',
          userMessage: 'Test',
        })
      ).rejects.toThrow('model is required');

      console.log('✅ Parameter validation working correctly');
    }, 10000);

    it('should validate supported providers', async () => {
      console.log('🧪 Testing provider validation...');
      
      await expect(
        llmService.generateUnifiedResponse({
          provider: 'unsupported-provider',
          model: 'test-model',
          systemPrompt: 'Test',
          userMessage: 'Test',
        })
      ).rejects.toThrow('Unsupported provider');

      console.log('✅ Provider validation working correctly');
    }, 10000);
  });

  describe('LLMServiceFactory Integration', () => {
    it('should use factory for response generation', async () => {
      console.log('🧪 Testing factory integration...');
      
      const result = await llmService.generateUnifiedResponse({
        provider: 'ollama',
        model: 'llama3.2:1b',
        systemPrompt: 'You are helpful.',
        userMessage: 'Say hello in 2 words.',
        options: {
          temperature: 0.1,
          maxTokens: 10,
          executionContext: TEST_EXECUTION_CONTEXT,
        }
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      if (typeof result === 'string') {
        expect(result.length).toBeGreaterThan(0);
        console.log('✅ Factory integration working:', result);
      }
    }, 30000);

    it('should handle concurrent requests efficiently', async () => {
      console.log('🧪 Testing concurrent requests...');
      
      const requests = Array.from({ length: 3 }, (_, i) =>
        llmService.generateUnifiedResponse({
          provider: 'ollama',
          model: 'llama3.2:1b',
          systemPrompt: 'You are a helpful assistant.',
          userMessage: `Count to ${i + 1}.`,
          options: {
            temperature: 0.1,
            maxTokens: 20,
            callerType: 'test',
            callerName: `concurrent-test-${i + 1}`,
            executionContext: TEST_EXECUTION_CONTEXT,
          }
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        
        // Type guard: when includeMetadata is not specified, result is a string
        if (typeof result === 'string') {
          expect(result.length).toBeGreaterThan(0);
          console.log(`✅ Concurrent request ${i + 1} completed: ${result.substring(0, 30)}...`);
        } else {
          throw new Error(`Expected string result for concurrent request ${i + 1} but got object`);
        }
      });

      console.log(`✅ All ${requests.length} concurrent requests completed in ${totalTime}ms`);
    }, 45000);
  });

  describe('Backward Compatibility', () => {
    it('should work with generateUserContentResponse', async () => {
      console.log('🧪 Testing generateUserContentResponse compatibility...');
      
      const result = await llmService.generateUserContentResponse(
        'You are a content writer.',
        'Write a one-sentence summary of AI.',
        {
          providerName: 'ollama',
          modelName: 'llama3.2:1b',
          temperature: 0.3,
          maxTokens: 50,
        },
        'test-auth-token',
        'test-session-id'
      );

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.usage).toBeDefined();
      expect(result.costCalculation).toBeDefined();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.costCalculation.inputTokens).toBeGreaterThan(0);
      expect(result.costCalculation.outputTokens).toBeGreaterThan(0);
      
      console.log('✅ User content response:', {
        content: result.content.substring(0, 60) + '...',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cost: result.costCalculation.totalCost
      });
    }, 30000);

    it('should work with legacy generateResponse method when provider specified', async () => {
      console.log('🧪 Testing legacy generateResponse compatibility...');
      
      const result = await llmService.generateResponse(
        'You are helpful.',
        'Say "legacy works" in exactly 2 words.',
        {
          providerName: 'ollama',
          modelName: 'llama3.2:1b',
          temperature: 0.1,
          maxTokens: 10,
          executionContext: TEST_EXECUTION_CONTEXT,
        }
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      if (typeof result === 'string') {
        expect(result.length).toBeGreaterThan(0);
      }
      
      console.log('✅ Legacy method works:', result);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid model gracefully', async () => {
      console.log('🧪 Testing invalid model handling...');
      
      await expect(
        llmService.generateUnifiedResponse({
          provider: 'ollama',
          model: 'nonexistent-model',
          systemPrompt: 'Test',
          userMessage: 'Test',
          options: {
            maxTokens: 10,
            executionContext: TEST_EXECUTION_CONTEXT,
          }
        })
      ).rejects.toThrow();

      console.log('✅ Invalid model handled correctly');
    }, 20000);

    it('should require explicit provider when none specified', async () => {
      console.log('🧪 Testing missing provider handling...');
      
      await expect(
        llmService.generateResponse('Test prompt', 'Test message', {
          executionContext: TEST_EXECUTION_CONTEXT,
        })
      ).rejects.toThrow('No LLM provider and model specified');

      console.log('✅ Missing provider handled correctly');
    }, 10000);
  });
});

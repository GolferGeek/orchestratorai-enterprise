/**
 * Integration test for the new unified LLM service architecture
 * Tests the generateUnifiedResponse method with real LLM calls
 */

const axios = require('axios');
const { getApiUrl } = require('../test-env');

const API_BASE = getApiUrl();

describe('LLM Unified Architecture Integration Tests', () => {
  let authToken;

  beforeAll(async () => {
    // Get auth token for testing
    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        email: 'demo.user@playground.com',
        password: 'demouser'
      });
      authToken = response.data.access_token;
      console.log('✅ Authentication successful');
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      throw error;
    }
  });

  describe('Unified generateResponse Method', () => {
    test('should generate response with explicit provider and model (Ollama)', async () => {
      const testRequest = {
        systemPrompt: 'You are a helpful assistant. Respond concisely.',
        userMessage: 'What is 2 + 2?',
        options: {
          providerName: 'ollama',
          modelName: 'llama3.2:1b',
          temperature: 0.1,
          maxTokens: 50
        }
      };

      const response = await axios.post(
        `${API_BASE}/llms/generate`,
        testRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          timeout: 30000 // 30 second timeout
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(typeof response.data).toBe('string');
      expect(response.data.length).toBeGreaterThan(0);
      
      console.log('✅ Ollama response:', response.data.substring(0, 100) + '...');
    }, 35000);

    test('should fail gracefully when no provider specified', async () => {
      const testRequest = {
        systemPrompt: 'You are a helpful assistant.',
        userMessage: 'Hello world',
        options: {
          // No providerName or modelName specified
          temperature: 0.7
        }
      };

      try {
        await axios.post(
          `${API_BASE}/llms/generate`,
          testRequest,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            }
          }
        );
        
        // Should not reach here
        fail('Expected request to fail without provider');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.message).toContain('LLM provider and model');
        console.log('✅ Proper error handling for missing provider');
      }
    });

    test('should work with generateUserContentResponse method', async () => {
      const testRequest = {
        systemPrompt: 'You are a content writer. Write briefly.',
        userMessage: 'Write a one-sentence summary of artificial intelligence.',
        userPreferences: {
          providerName: 'ollama',
          modelName: 'llama3.2:1b',
          temperature: 0.3
        }
      };

      const response = await axios.post(
        `${API_BASE}/llms/generate-user-content`,
        testRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          timeout: 30000
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.content).toBeDefined();
      expect(response.data.usage).toBeDefined();
      expect(response.data.costCalculation).toBeDefined();
      
      console.log('✅ User content response:', {
        content: response.data.content.substring(0, 100) + '...',
        tokens: response.data.usage.totalTokens,
        cost: response.data.costCalculation.totalCost
      });
    }, 35000);
  });

  describe('LLMServiceFactory Integration', () => {
    test('should handle multiple concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 3 }, (_, i) => ({
        systemPrompt: 'You are a helpful assistant.',
        userMessage: `Count to ${i + 1}`,
        options: {
          providerName: 'ollama',
          modelName: 'llama3.2:1b',
          temperature: 0.1
        }
      }));

      const startTime = Date.now();
      
      const responses = await Promise.all(
        requests.map(req => 
          axios.post(`${API_BASE}/llms/generate`, req, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            timeout: 30000
          })
        )
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.data).toBeDefined();
        console.log(`✅ Concurrent request ${i + 1} completed`);
      });

      console.log(`✅ All ${requests.length} concurrent requests completed in ${totalTime}ms`);
    }, 45000);
  });
});

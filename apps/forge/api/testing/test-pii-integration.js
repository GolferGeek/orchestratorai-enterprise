#!/usr/bin/env node

/**
 * Integration test for PII service with NestJS
 * Tests the actual service implementation
 */

const path = require('path');

async function testPIIIntegration() {
  console.log('🧪 Testing PII Service Integration\n');

  try {
    // Set up minimal environment
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'; // Mock key for testing
    
    console.log('📦 Loading NestJS modules...');
    
    // Import required modules
    const { Test } = require('@nestjs/testing');
    const { PIIService } = require('./src/services/pii.service');
    const { DataSanitizationService } = require('./src/llms/data-sanitization.service');
    
    console.log('✅ Modules loaded successfully');
    
    // Create a test module with mocked dependencies
    const moduleRef = await Test.createTestingModule({
      providers: [
        PIIService,
        {
          provide: DataSanitizationService,
          useValue: {
            // Mock the DataSanitizationService methods
            sanitizeText: jest.fn().mockImplementation(async (text, options) => {
              // Simple mock implementation
              const hasSSN = /\d{3}-\d{2}-\d{4}/.test(text);
              const hasEmail = /@/.test(text);
              
              if (hasSSN) {
                return {
                  sanitizedText: text,
                  redactionResult: {
                    redactionCount: 1,
                    patternsMatched: ['SSN']
                  }
                };
              }
              
              if (hasEmail) {
                return {
                  sanitizedText: text.replace(/@\S+/g, '@REDACTED'),
                  pseudonymizationResult: {
                    pseudonyms: [{ dataType: 'email' }]
                  }
                };
              }
              
              return {
                sanitizedText: text,
                redactionResult: { redactionCount: 0 },
                pseudonymizationResult: { pseudonyms: [] }
              };
            }),
            
            sanitizeForLLM: jest.fn().mockImplementation(async (systemPrompt, userMessage, options) => {
              const hasEmail = /@/.test(userMessage);
              
              return {
                sanitizedSystemPrompt: systemPrompt,
                sanitizedUserMessage: hasEmail ? userMessage.replace(/@\S+/g, '@PSEUDO') : userMessage,
                reversalContext: hasEmail ? { '@PSEUDO': userMessage.match(/@\S+/)?.[0] } : null,
                userSanitizationResult: {
                  sanitizedText: userMessage,
                  pseudonymizationResult: hasEmail ? { pseudonyms: [{ dataType: 'email' }] } : { pseudonyms: [] }
                }
              };
            }),
            
            reverseLLMResponse: jest.fn().mockImplementation(async (response, context) => {
              if (!context) return response;
              
              let restored = response;
              for (const [pseudo, original] of Object.entries(context)) {
                restored = restored.replace(new RegExp(pseudo, 'g'), original);
              }
              return restored;
            }),
            
            extractSanitizationMetrics: jest.fn().mockReturnValue({
              sanitizationLevel: 'moderate',
              piiDetected: true,
              piiTypes: ['email'],
              pseudonymsUsed: 1,
              pseudonymTypes: ['email'],
              redactionsApplied: 0,
              redactionTypes: [],
              sanitizationTimeMs: 10,
              reversalContextSize: 1
            }),
            
            debug: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
          }
        }
      ],
    }).compile();

    const piiService = moduleRef.get<PIIService>(PIIService);
    console.log('✅ PIIService instance created\n');

    // Test 1: Policy Checking
    console.log('🔍 Testing Policy Checking...\n');
    
    const testCases = [
      {
        name: "Clean Content",
        prompt: "What is the weather today?",
        expectedAllowed: true
      },
      {
        name: "SSN (Should Block)",
        prompt: "My SSN is 123-45-6789",
        expectedAllowed: false
      },
      {
        name: "Email (Should Allow with Sanitization)",
        prompt: "Contact me at john@example.com",
        expectedAllowed: true
      }
    ];

    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}`);
      console.log(`Prompt: "${testCase.prompt}"`);
      
      try {
        const result = await piiService.checkPolicy(testCase.prompt, {
          conversationId: 'test-conversation'
        });

        console.log(`✅ Allowed: ${result.allowed}`);
        console.log(`📊 Violations: ${result.violations.length}`);
        console.log(`💭 Reasoning: ${result.reasoningPath.join(' → ')}`);

        if (result.allowed === testCase.expectedAllowed) {
          console.log(`✅ PASS: Policy check worked as expected`);
        } else {
          console.log(`❌ FAIL: Expected allowed=${testCase.expectedAllowed}, got ${result.allowed}`);
        }

      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
      }
      
      console.log('---\n');
    }

    // Test 2: LLM Sanitization
    console.log('🤖 Testing LLM Sanitization...\n');
    
    const llmTests = [
      {
        name: "Local Provider (No Sanitization)",
        systemPrompt: "You are helpful.",
        userMessage: "My email is test@example.com",
        isLocal: true,
        expectedSanitization: false
      },
      {
        name: "External Provider (With Sanitization)",
        systemPrompt: "You are helpful.",
        userMessage: "My email is test@example.com",
        isLocal: false,
        expectedSanitization: true
      }
    ];

    for (const test of llmTests) {
      console.log(`Testing: ${test.name}`);
      
      try {
        const result = await piiService.sanitizeForLLM(
          test.systemPrompt,
          test.userMessage,
          test.isLocal,
          { conversationId: 'test-conversation' }
        );

        console.log(`✅ Should Apply Sanitization: ${result.shouldApplySanitization}`);
        console.log(`🔄 Message Changed: ${result.sanitizedUserMessage !== test.userMessage}`);
        console.log(`🔑 Has Reversal Context: ${!!result.reversalContext}`);

        if (result.shouldApplySanitization === test.expectedSanitization) {
          console.log(`✅ PASS: LLM sanitization worked as expected`);
        } else {
          console.log(`❌ FAIL: Expected sanitization=${test.expectedSanitization}, got ${result.shouldApplySanitization}`);
        }

        // Test restoration if we have context
        if (result.reversalContext) {
          console.log('\n🔄 Testing Response Restoration...');
          const mockResponse = "Here is your email: @PSEUDO";
          
          const restorationResult = await piiService.restoreResponse(mockResponse, result.reversalContext);
          console.log(`✅ Restoration Success: ${restorationResult.success}`);
          console.log(`📝 Restored: "${restorationResult.restoredContent}"`);
        }

      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
      }
      
      console.log('---\n');
    }

    console.log('🎉 Integration Testing Complete!');
    await moduleRef.close();

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Mock Jest for testing environment
if (!global.jest) {
  global.jest = {
    fn: () => ({
      mockImplementation: (impl) => impl,
      mockReturnValue: (value) => () => value
    })
  };
}

// Run the test
if (require.main === module) {
  testPIIIntegration().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testPIIIntegration };

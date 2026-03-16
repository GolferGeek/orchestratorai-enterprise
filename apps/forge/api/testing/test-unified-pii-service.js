#!/usr/bin/env node

/**
 * Test script for the unified PII service
 * Tests both policy checking and LLM sanitization workflows
 */

const { createClient } = require('@supabase/supabase-js');
const { getSupabaseUrl } = require('./test-env');
require('dotenv').config();

// Supabase setup
const supabaseUrl = getSupabaseUrl();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test cases for PII policy checking
const testCases = [
  {
    name: "Clean Content",
    prompt: "What is the weather like today?",
    expectedAllowed: true,
    expectedViolations: 0
  },
  {
    name: "SSN (Showstopper)",
    prompt: "My social security number is 123-45-6789. Can you help me?",
    expectedAllowed: false,
    expectedViolations: 1
  },
  {
    name: "Credit Card (Showstopper)", 
    prompt: "I need help with my credit card 4532-1234-5678-9012",
    expectedAllowed: false,
    expectedViolations: 1
  },
  {
    name: "Email (Pseudonymizer)",
    prompt: "Please send the report to john.doe@example.com",
    expectedAllowed: true,
    expectedViolations: 0,
    expectedPseudonymization: true
  },
  {
    name: "Phone Number (Pseudonymizer)",
    prompt: "Call me at (555) 123-4567 when ready",
    expectedAllowed: true,
    expectedViolations: 0,
    expectedPseudonymization: true
  },
  {
    name: "IP Address (Flagger)",
    prompt: "The server at 192.168.1.100 is down",
    expectedAllowed: true,
    expectedViolations: 0,
    expectedPseudonymization: true
  },
  {
    name: "Multiple PII Types",
    prompt: "Contact John Doe at john.doe@example.com or call (555) 123-4567. His SSN is 123-45-6789.",
    expectedAllowed: false, // Should be blocked due to SSN
    expectedViolations: 1
  }
];

// Test LLM sanitization scenarios
const llmTestCases = [
  {
    name: "Local Provider (No Sanitization)",
    systemPrompt: "You are a helpful assistant.",
    userMessage: "My email is test@example.com",
    isLocalProvider: true,
    expectedSanitization: false
  },
  {
    name: "External Provider (With Sanitization)",
    systemPrompt: "You are a helpful assistant.",
    userMessage: "My email is test@example.com and phone is (555) 123-4567",
    isLocalProvider: false,
    expectedSanitization: true
  }
];

async function testPIIService() {
  console.log('🧪 Testing Unified PII Service\n');

  try {
    // Import the NestJS app for testing
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./src/app.module');
    
    console.log('📦 Creating NestJS application...');
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false // Reduce noise during testing
    });

    const piiService = app.get('PIIService');
    console.log('✅ PIIService loaded successfully\n');

    // Test 1: PII Policy Checking
    console.log('🔍 Testing PII Policy Checking...\n');
    
    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}`);
      console.log(`Prompt: "${testCase.prompt}"`);
      
      try {
        const result = await piiService.checkPolicy(testCase.prompt, {
          conversationId: 'test-conversation',
          userId: 'test-user'
        });

        console.log(`✅ Allowed: ${result.allowed}`);
        console.log(`📊 Violations: ${result.violations.length}`);
        console.log(`🔄 Sanitized: ${result.sanitizedPrompt !== testCase.prompt}`);
        
        if (result.reasoningPath.length > 0) {
          console.log(`💭 Reasoning: ${result.reasoningPath.join(' → ')}`);
        }

        // Validate expectations
        if (result.allowed !== testCase.expectedAllowed) {
          console.log(`❌ FAIL: Expected allowed=${testCase.expectedAllowed}, got ${result.allowed}`);
        } else if (result.violations.length !== testCase.expectedViolations) {
          console.log(`❌ FAIL: Expected ${testCase.expectedViolations} violations, got ${result.violations.length}`);
        } else {
          console.log(`✅ PASS: Policy check worked as expected`);
        }

      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
      }
      
      console.log('---\n');
    }

    // Test 2: LLM Sanitization Workflow
    console.log('🤖 Testing LLM Sanitization Workflow...\n');
    
    for (const testCase of llmTestCases) {
      console.log(`Testing: ${testCase.name}`);
      console.log(`System: "${testCase.systemPrompt}"`);
      console.log(`User: "${testCase.userMessage}"`);
      console.log(`Local Provider: ${testCase.isLocalProvider}`);
      
      try {
        const result = await piiService.sanitizeForLLM(
          testCase.systemPrompt,
          testCase.userMessage,
          testCase.isLocalProvider,
          {
            conversationId: 'test-conversation',
            sessionId: 'test-session'
          }
        );

        console.log(`✅ Should Apply Sanitization: ${result.shouldApplySanitization}`);
        console.log(`🔄 System Prompt Changed: ${result.sanitizedSystemPrompt !== testCase.systemPrompt}`);
        console.log(`🔄 User Message Changed: ${result.sanitizedUserMessage !== testCase.userMessage}`);
        console.log(`🔑 Has Reversal Context: ${!!result.reversalContext}`);
        
        if (result.sanitizationMetrics) {
          console.log(`📊 Sanitization Level: ${result.sanitizationMetrics.sanitizationLevel}`);
          console.log(`🔍 PII Detected: ${result.sanitizationMetrics.piiDetected}`);
          console.log(`🎭 Pseudonyms Used: ${result.sanitizationMetrics.pseudonymsUsed}`);
        }

        // Validate expectations
        if (result.shouldApplySanitization !== testCase.expectedSanitization) {
          console.log(`❌ FAIL: Expected sanitization=${testCase.expectedSanitization}, got ${result.shouldApplySanitization}`);
        } else {
          console.log(`✅ PASS: LLM sanitization worked as expected`);
        }

        // Test restoration if we have a reversal context
        if (result.reversalContext) {
          console.log('\n🔄 Testing Response Restoration...');
          const mockResponse = "Here is your information: PSEUDO_EMAIL_1 and PSEUDO_PHONE_1";
          
          const restorationResult = await piiService.restoreResponse(mockResponse, result.reversalContext);
          console.log(`✅ Restoration Success: ${restorationResult.success}`);
          console.log(`📝 Restored Content: "${restorationResult.restoredContent}"`);
          
          if (restorationResult.error) {
            console.log(`⚠️ Restoration Error: ${restorationResult.error}`);
          }
        }

      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
      }
      
      console.log('---\n');
    }

    // Test 3: Integration with Routing Service
    console.log('🛣️ Testing Integration with Routing Service...\n');
    
    try {
      const routingService = app.get('CentralizedRoutingService');
      console.log('✅ CentralizedRoutingService loaded successfully');
      
      const routingResult = await routingService.determineRoute(
        "My SSN is 123-45-6789, please help me with my account",
        {
          conversationId: 'test-conversation',
          userId: 'test-user'
        }
      );

      console.log(`🛣️ Routing Provider: ${routingResult.provider}`);
      console.log(`🤖 Routing Model: ${routingResult.model}`);
      console.log(`🔒 Policy Blocked: ${routingResult.provider === 'policy-blocked'}`);
      
      if (routingResult.reasoningPath) {
        console.log(`💭 Routing Reasoning: ${routingResult.reasoningPath.slice(-3).join(' → ')}`);
      }

      if (routingResult.provider === 'policy-blocked') {
        console.log(`✅ PASS: Routing correctly blocked PII violation`);
      } else {
        console.log(`❌ FAIL: Expected routing to block PII violation`);
      }

    } catch (error) {
      console.log(`❌ ERROR testing routing integration: ${error.message}`);
    }

    console.log('\n🎉 Testing Complete!');
    await app.close();

  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests
if (require.main === module) {
  testPIIService().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testPIIService };

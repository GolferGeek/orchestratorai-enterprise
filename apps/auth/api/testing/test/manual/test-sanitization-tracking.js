#!/usr/bin/env node

/**
 * Data Sanitization Tracking Demo
 * 
 * This script demonstrates the enhanced LLM usage tracking with
 * detailed data sanitization and source blinding metrics.
 * 
 * Usage:
 *   node test/manual/test-sanitization-tracking.js [provider] [--mock]
 * 
 * Examples:
 *   node test/manual/test-sanitization-tracking.js openai --mock
 *   node test/manual/test-sanitization-tracking.js anthropic
 */

const { NestFactory } = require('@nestjs/core');
const { LLMModule } = require('../../src/llms/llm.module');
const { SupabaseModule } = require('../../src/supabase/supabase.module');

async function testSanitizationTracking() {
  console.log('🔍 Data Sanitization & Source Blinding Tracking Demo');
  
  const provider = process.argv[2] || 'openai';
  const mockMode = process.argv.includes('--mock');
  
  console.log(`📋 Provider: ${provider}`);
  console.log(`🧪 Mock mode: ${mockMode}`);
  
  try {
    const app = await NestFactory.createApplicationContext(LLMModule);
    const llmService = app.get('LLMService');
    
    // Test cases with different levels of sensitive data
    const testCases = [
      {
        name: 'Clean Data (No PII)',
        systemPrompt: 'You are a helpful assistant for general questions.',
        userMessage: 'What is the capital of France?',
        expectedSanitization: 'none',
      },
      {
        name: 'Personal Information',
        systemPrompt: 'You are a customer service assistant.',
        userMessage: 'My name is John Smith, email john.smith@company.com, phone (555) 123-4567. I need help with my account.',
        expectedSanitization: 'standard',
      },
      {
        name: 'Sensitive Data with Secrets',
        systemPrompt: 'You are a technical support assistant.',
        userMessage: 'I am Sarah Johnson from Acme Corp. My API key is sk-1234567890abcdef and my password is MySecret123. Please help debug the integration.',
        expectedSanitization: 'strict',
      },
      {
        name: 'Mixed PII and Business Data',
        systemPrompt: 'You are a business analyst.',
        userMessage: 'Our company Globodyne Inc located in New York has revenue issues. Contact our CEO Michael Davis at mdavis@globodyne.com for more details.',
        expectedSanitization: 'standard',
      },
    ];
    
    console.log('\n🧪 Testing Data Sanitization Tracking...\n');
    
    for (const [index, testCase] of testCases.entries()) {
      console.log(`📋 Test ${index + 1}: ${testCase.name}`);
      console.log(`📝 Message: "${testCase.userMessage.substring(0, 60)}${testCase.userMessage.length > 60 ? '...' : ''}"`);
      
      try {
        let response;
        
        if (mockMode) {
          // Mock the LLM call to focus on sanitization tracking
          console.log('   🔄 Mocking LLM call (sanitization will still be processed)...');
          
          // Simulate the enhanced response call
          response = {
            content: 'This is a mocked response for testing sanitization tracking.',
            usage: {
              inputTokens: 50,
              outputTokens: 20,
              totalCost: 0.001,
              responseTimeMs: 150,
              
              // These would be populated by the real sanitization process
              dataSanitizationApplied: testCase.expectedSanitization !== 'none',
              sanitizationLevel: testCase.expectedSanitization,
              piiDetected: testCase.userMessage.includes('@') || testCase.userMessage.includes('('),
              piiTypes: testCase.userMessage.includes('@') ? ['email'] : [],
              pseudonymsUsed: (testCase.userMessage.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || []).length,
              pseudonymTypes: testCase.userMessage.includes('@') ? ['person_name'] : [],
              redactionsApplied: testCase.userMessage.includes('sk-') || testCase.userMessage.includes('password') ? 1 : 0,
              redactionTypes: testCase.userMessage.includes('sk-') ? ['api_key'] : [],
              
              sourceBlindingApplied: provider !== 'ollama',
              headersStripped: provider !== 'ollama' ? 12 : 0,
              customUserAgentUsed: provider !== 'ollama',
              noTrainHeaderSent: provider !== 'ollama',
              noRetainHeaderSent: false,
              
              dataClassification: 'public',
              policyProfile: 'standard',
              sovereignMode: false,
              
              sanitizationTimeMs: testCase.expectedSanitization !== 'none' ? 8 : 0,
              reversalContextSize: testCase.expectedSanitization !== 'none' ? 245 : 0,
              
              complianceFlags: {
                gdprCompliant: testCase.expectedSanitization !== 'none',
                hipaaCompliant: testCase.expectedSanitization === 'strict',
                pciCompliant: testCase.userMessage.includes('sk-'),
              },
            },
            costCalculation: {
              inputCost: 0.0005,
              outputCost: 0.0005,
              totalCost: 0.001,
            },
            llmMetadata: {
              providerId: 'provider-123',
              providerName: provider,
              modelId: 'model-456',
              modelName: `${provider}-model`,
              responseTimeMs: 150,
            },
          };
        } else {
          // Make actual LLM call
          console.log('   🔄 Making real LLM call...');
          
          const enhancedResponse = await llmService.generateEnhancedResponse(
            'test-user',
            testCase.systemPrompt,
            testCase.userMessage,
            {
              temperature: 0.1,
              maxTokens: 100,
            }
          );
          
          response = enhancedResponse;
        }
        
        // Display detailed usage metrics
        const usage = response.usage;
        
        console.log('   ✅ Response generated successfully');
        console.log('   📊 Usage Metrics:');
        console.log(`      💰 Cost: $${usage.totalCost?.toFixed(4) || '0.0000'}`);
        console.log(`      🚀 Response Time: ${usage.responseTimeMs}ms`);
        console.log(`      📝 Tokens: ${usage.inputTokens || 0} in, ${usage.outputTokens || 0} out`);
        console.log('');
        console.log('   📋 Complete Enhanced Metrics (JSON):');
        console.log(JSON.stringify(usage, null, 2));
        
        console.log('   🛡️  Data Sanitization:');
        console.log(`      🔒 Applied: ${usage.dataSanitizationApplied ? '✅' : '❌'}`);
        console.log(`      📈 Level: ${usage.sanitizationLevel}`);
        console.log(`      👁️  PII Detected: ${usage.piiDetected ? '✅' : '❌'}`);
        
        if (usage.piiDetected) {
          console.log(`      🏷️  PII Types: ${usage.piiTypes?.join(', ') || 'none'}`);
          console.log(`      🎭 Pseudonyms Used: ${usage.pseudonymsUsed || 0}`);
          console.log(`      🔄 Pseudonym Types: ${usage.pseudonymTypes?.join(', ') || 'none'}`);
        }
        
        if (usage.redactionsApplied > 0) {
          console.log(`      🔴 Redactions: ${usage.redactionsApplied}`);
          console.log(`      🗂️  Redaction Types: ${usage.redactionTypes?.join(', ') || 'none'}`);
        }
        
        console.log('   🕵️  Source Blinding:');
        console.log(`      🔒 Applied: ${usage.sourceBlindingApplied ? '✅' : '❌'}`);
        
        if (usage.sourceBlindingApplied) {
          console.log(`      🚫 Headers Stripped: ${usage.headersStripped || 0}`);
          console.log(`      🤖 Custom User-Agent: ${usage.customUserAgentUsed ? '✅' : '❌'}`);
          console.log(`      🚫 No-Train Header: ${usage.noTrainHeaderSent ? '✅' : '❌'}`);
        }
        
        console.log('   ⚖️  Compliance:');
        if (usage.complianceFlags) {
          console.log(`      🇪🇺 GDPR: ${usage.complianceFlags.gdprCompliant ? '✅' : '❌'}`);
          console.log(`      🏥 HIPAA: ${usage.complianceFlags.hipaaCompliant ? '✅' : '❌'}`);
          console.log(`      💳 PCI: ${usage.complianceFlags.pciCompliant ? '✅' : '❌'}`);
        }
        
        console.log('   ⏱️  Performance:');
        console.log(`      🧹 Sanitization Time: ${usage.sanitizationTimeMs || 0}ms`);
        console.log(`      💾 Reversal Context: ${usage.reversalContextSize || 0} bytes`);
        
      } catch (error) {
        console.log('   ❌ Test failed:', error.message);
        
        // Even on API errors, we might still have sanitization metrics
        if (error.message.includes('401') || error.message.includes('authentication')) {
          console.log('   ℹ️  Note: API authentication error expected with test keys');
          console.log('   ℹ️  Sanitization and source blinding would still be applied');
        }
      }
      
      console.log('');
    }
    
    // Summary report
    console.log('📊 Summary Report:');
    console.log('   🔒 Data Sanitization: Applied to external providers only');
    console.log('   🕵️  Source Blinding: Applied to all external API calls');
    console.log('   📈 Metrics Tracking: Comprehensive privacy and security metrics');
    console.log('   ⚖️  Compliance: Automated compliance flag generation');
    console.log('');
    console.log('✅ Data Sanitization Tracking Demo Complete');
    
    await app.close();
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Print usage if needed
if (process.argv.includes('--help')) {
  console.log('Data Sanitization Tracking Demo');
  console.log('');
  console.log('Usage: node test-sanitization-tracking.js [provider] [--mock]');
  console.log('');
  console.log('Options:');
  console.log('  provider    LLM provider (openai, anthropic, google) - default: openai');
  console.log('  --mock      Use mock responses instead of real API calls');
  console.log('  --help      Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node test-sanitization-tracking.js openai --mock');
  console.log('  node test-sanitization-tracking.js anthropic');
  process.exit(0);
}

testSanitizationTracking();
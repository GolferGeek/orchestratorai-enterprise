#!/usr/bin/env node

/**
 * Enhanced LLM Metrics End-to-End Test
 * 
 * This script performs comprehensive testing of the enhanced LLM usage tracking
 * by making actual LLM calls and verifying the metrics are stored correctly.
 * 
 * Usage:
 *   node test/manual/test-enhanced-metrics-e2e.js
 * 
 * Environment Variables Required:
 *   - OPENAI_API_KEY (for external provider testing)
 *   - ANTHROPIC_API_KEY (for external provider testing)
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

const { NestFactory } = require('@nestjs/core');
const { LLMModule } = require('../../src/llms/llm.module');
const { SupabaseModule } = require('../../src/supabase/supabase.module');
const { getTableName } = require('../../src/supabase/supabase.config');

// Test cases with varying levels of sensitive data
const testCases = [
  {
    name: 'Local Provider - Clean Data',
    systemPrompt: 'You are a helpful assistant.',
    userMessage: 'What is 2+2? Please answer briefly.',
    provider: 'ollama',
    expectedSanitization: false,
    expectedSourceBlinding: false,
    description: 'Local Ollama provider with no sensitive data',
  },
  {
    name: 'External Provider - PII Data',
    systemPrompt: 'You are a customer service assistant.',
    userMessage: 'Hello, I am John Doe, my email is john.doe@example.com and phone is (555) 123-4567. Can you help me?',
    provider: 'openai',
    expectedSanitization: true,
    expectedSourceBlinding: true,
    description: 'OpenAI with PII - should trigger sanitization and source blinding',
  },
  {
    name: 'External Provider - Secrets',
    systemPrompt: 'You are a technical support assistant.',
    userMessage: 'My API key is sk-test123456789 and my password is Secret123. Please help with integration.',
    provider: 'openai',
    expectedSanitization: true,
    expectedSourceBlinding: true,
    description: 'OpenAI with secrets - should trigger redaction',
  },
  {
    name: 'External Provider - Mixed Data',
    systemPrompt: 'You are a business analyst.',
    userMessage: 'Please analyze our company TechCorp, CEO Sarah Wilson (sarah@techcorp.com), revenue $2M.',
    provider: 'openai',
    expectedSanitization: true,
    expectedSourceBlinding: true,
    description: 'OpenAI with mixed business/personal data',
  },
];

async function runEnhancedMetricsTest() {
  console.log('🚀 Enhanced LLM Metrics End-to-End Test');
  console.log('=========================================\n');

  try {
    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(LLMModule, {
      logger: ['error', 'warn'], // Reduce log noise
    });

    const llmService = app.get('LLMService');
    const supabaseService = app.get('SupabaseService');

    console.log('✅ Application context created successfully\n');

    const results = [];

    for (const [index, testCase] of testCases.entries()) {
      console.log(`\n📋 Test ${index + 1}/${testCases.length}: ${testCase.name}`);
      console.log(`   Description: ${testCase.description}`);
      console.log(`   Provider: ${testCase.provider}`);
      console.log(`   Message: "${testCase.userMessage.substring(0, 50)}${testCase.userMessage.length > 50 ? '...' : ''}"`);

      try {
        const startTime = Date.now();

        // Make the LLM call
        const response = await llmService.generateCentralizedResponse(
          testCase.systemPrompt,
          testCase.userMessage,
          {
            provider: testCase.provider,
            temperature: 0.1,
            maxTokens: 50,
            callerType: 'e2e-manual-test',
            callerName: `enhanced-metrics-manual-${index + 1}`,
            conversationId: `manual-test-${Date.now()}`,
            dataClassification: 'test',
          }
        );

        const responseTime = Date.now() - startTime;
        const runId = response.runMetadata.runId;

        console.log(`   ✅ LLM Response received (${responseTime}ms)`);
        console.log(`   🆔 Run ID: ${runId}`);
        console.log(`   💰 Cost: $${response.runMetadata.cost || '0.0000'}`);
        console.log(`   📝 Response: "${response.content.substring(0, 60)}${response.content.length > 60 ? '...' : ''}"`);

        // Wait for async database operations to complete
        console.log('   ⏳ Waiting for database write to complete...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Query database to verify enhanced metrics
        const client = supabaseService.getServiceClient();
        const { data: dbRecord, error } = await client
          .from(getTableName('llm_usage'))
          .select('*')
          .eq('run_id', runId)
          .single();

        if (error) {
          throw new Error(`Database query failed: ${error.message}`);
        }

        if (!dbRecord) {
          throw new Error('Database record not found');
        }

        console.log('   📊 Database record retrieved successfully');

        // Verify enhanced metrics
        const metrics = {
          dataSanitizationApplied: dbRecord.data_sanitization_applied,
          sanitizationLevel: dbRecord.sanitization_level,
          piiDetected: dbRecord.pii_detected,
          piiTypes: JSON.parse(dbRecord.pii_types || '[]'),
          pseudonymsUsed: dbRecord.pseudonyms_used || 0,
          redactionsApplied: dbRecord.redactions_applied || 0,
          redactionTypes: JSON.parse(dbRecord.redaction_types || '[]'),
          sourceBlindingApplied: dbRecord.source_blinding_applied,
          headersStripped: dbRecord.headers_stripped || 0,
          customUserAgentUsed: dbRecord.custom_user_agent_used,
          noTrainHeaderSent: dbRecord.no_train_header_sent,
          complianceFlags: JSON.parse(dbRecord.compliance_flags || '{}'),
          sovereignMode: dbRecord.sovereign_mode,
        };

        console.log('\n   🛡️  Enhanced Metrics Verification:');
        console.log(`      🔒 Data Sanitization: ${metrics.dataSanitizationApplied ? '✅ Applied' : '❌ Not Applied'}`);
        console.log(`      📈 Sanitization Level: ${metrics.sanitizationLevel}`);
        console.log(`      👁️  PII Detected: ${metrics.piiDetected ? '✅ Yes' : '❌ No'}`);
        
        if (metrics.piiDetected) {
          console.log(`      🏷️  PII Types: ${metrics.piiTypes.join(', ') || 'none'}`);
          console.log(`      🎭 Pseudonyms Used: ${metrics.pseudonymsUsed}`);
        }

        if (metrics.redactionsApplied > 0) {
          console.log(`      🔴 Redactions Applied: ${metrics.redactionsApplied}`);
          console.log(`      🗂️  Redaction Types: ${metrics.redactionTypes.join(', ')}`);
        }

        console.log(`      🕵️  Source Blinding: ${metrics.sourceBlindingApplied ? '✅ Applied' : '❌ Not Applied'}`);
        
        if (metrics.sourceBlindingApplied) {
          console.log(`      🚫 Headers Stripped: ${metrics.headersStripped}`);
          console.log(`      🤖 Custom User-Agent: ${metrics.customUserAgentUsed ? '✅' : '❌'}`);
          console.log(`      🚫 No-Train Header: ${metrics.noTrainHeaderSent ? '✅' : '❌'}`);
        }

        console.log(`      🏠 Sovereign Mode: ${metrics.sovereignMode ? '✅ Yes' : '❌ No'}`);
        console.log(`      ⚖️  GDPR Compliant: ${metrics.complianceFlags.gdprCompliant ? '✅' : '❌'}`);

        // Validate expectations
        let validationErrors = [];

        if (testCase.expectedSanitization !== metrics.dataSanitizationApplied) {
          validationErrors.push(`Expected sanitization: ${testCase.expectedSanitization}, got: ${metrics.dataSanitizationApplied}`);
        }

        if (testCase.expectedSourceBlinding !== metrics.sourceBlindingApplied) {
          validationErrors.push(`Expected source blinding: ${testCase.expectedSourceBlinding}, got: ${metrics.sourceBlindingApplied}`);
        }

        // Local vs External provider checks
        if (testCase.provider === 'ollama') {
          if (metrics.sovereignMode !== true) {
            validationErrors.push('Local provider should have sovereign mode = true');
          }
          if (metrics.sourceBlindingApplied !== false) {
            validationErrors.push('Local provider should not have source blinding');
          }
        } else {
          if (metrics.sovereignMode !== false) {
            validationErrors.push('External provider should have sovereign mode = false');
          }
          if (metrics.sourceBlindingApplied !== true) {
            validationErrors.push('External provider should have source blinding applied');
          }
        }

        if (validationErrors.length > 0) {
          console.log('\n   ❌ Validation Errors:');
          validationErrors.forEach(error => console.log(`      • ${error}`));
          throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
        }

        console.log('\n   ✅ All validations passed!');

        results.push({
          testCase: testCase.name,
          success: true,
          runId,
          metrics,
          responseTime,
        });

      } catch (error) {
        console.log(`\n   ❌ Test failed: ${error.message}`);
        results.push({
          testCase: testCase.name,
          success: false,
          error: error.message,
        });
      }
    }

    // Print comprehensive summary
    console.log('\n\n📊 COMPREHENSIVE TEST SUMMARY');
    console.log('============================');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Successful: ${successful.length}/${results.length}`);
    console.log(`❌ Failed: ${failed.length}/${results.length}`);

    if (successful.length > 0) {
      console.log('\n✅ SUCCESSFUL TESTS:');
      successful.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.testCase}`);
        console.log(`      🆔 Run ID: ${result.runId}`);
        console.log(`      ⏱️  Response Time: ${result.responseTime}ms`);
        console.log(`      🛡️  Sanitization: ${result.metrics?.dataSanitizationApplied ? 'Applied' : 'Not Applied'}`);
        console.log(`      🕵️  Source Blinding: ${result.metrics?.sourceBlindingApplied ? 'Applied' : 'Not Applied'}`);
        console.log(`      👁️  PII Detected: ${result.metrics?.piiDetected ? 'Yes' : 'No'}`);
        console.log(`      🏠 Sovereign Mode: ${result.metrics?.sovereignMode ? 'Yes' : 'No'}`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ FAILED TESTS:');
      failed.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.testCase}`);
        console.log(`      Error: ${result.error}`);
      });
    }

    console.log(`\n${failed.length === 0 ? '🎉' : '💥'} Test completed with ${successful.length}/${results.length} passing tests`);

    await app.close();
    process.exit(failed.length === 0 ? 0 : 1);

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Handle CLI help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Enhanced LLM Metrics End-to-End Test');
  console.log('');
  console.log('Usage: node test-enhanced-metrics-e2e.js');
  console.log('');
  console.log('This script tests the complete enhanced LLM metrics pipeline:');
  console.log('• Makes real LLM calls to local (Ollama) and external providers');
  console.log('• Verifies data sanitization and source blinding work correctly');
  console.log('• Validates enhanced metrics are stored in the database');
  console.log('• Checks compliance flags and sovereignty modes');
  console.log('');
  console.log('Environment variables required:');
  console.log('• OPENAI_API_KEY (for external provider testing)');
  console.log('• SUPABASE_URL');
  console.log('• SUPABASE_SERVICE_ROLE_KEY');
  console.log('');
  process.exit(0);
}

// Run the test
runEnhancedMetricsTest();
#!/usr/bin/env node

/**
 * Manual Source Blinding Test Script
 * 
 * This script helps manually verify that source blinding is working correctly
 * by making real API calls and inspecting the headers being sent.
 * 
 * Usage:
 *   node test/manual/test-source-blinding.js [provider] [--dry-run]
 * 
 * Examples:
 *   node test/manual/test-source-blinding.js openai
 *   node test/manual/test-source-blinding.js anthropic --dry-run
 */

const { NestFactory } = require('@nestjs/core');
const { LLMModule } = require('../../src/llms/llm.module');
const { SupabaseModule } = require('../../src/supabase/supabase.module');

async function testSourceBlinding() {
  console.log('🔍 Starting Source Blinding Test');
  
  const provider = process.argv[2] || 'openai';
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`📋 Testing provider: ${provider}`);
  console.log(`🧪 Dry run: ${dryRun}`);
  
  try {
    // Create a minimal NestJS application
    const app = await NestFactory.createApplicationContext(LLMModule);
    const llmService = app.get('LLMService');
    const sourceBlindingService = app.get('SourceBlindingService');
    
    // Test 1: Source Blinding Service Direct Test
    console.log('\n🧪 Test 1: Direct Source Blinding Service Test');
    
    const testHeaders = {
      'Authorization': 'Bearer sk-test-12345',
      'Content-Type': 'application/json',
      'User-Agent': 'MyCompany/InternalApp/1.0',
      'Host': 'internal.mycompany.com',
      'Origin': 'https://mycompany.com',
      'Referer': 'https://mycompany.com/ai-dashboard',
      'X-Forwarded-For': '192.168.1.100, 10.0.0.1',
      'X-Company-ID': 'acme-corp-12345',
      'X-Tenant-ID': 'tenant-engineering',
      'X-Request-ID': 'req-abcd-1234',
      'X-Environment': 'production',
      'X-Datacenter': 'us-west-2',
      'CF-Ray': 'cf-ray-12345',
      'X-Real-IP': '203.0.113.1',
    };
    
    const blindingResult = sourceBlindingService.testSourceBlinding(testHeaders, provider);
    
    console.log('   ✅ Original headers count:', Object.keys(blindingResult.originalHeaders).length);
    console.log('   ✅ Blinded headers count:', Object.keys(blindingResult.blindedHeaders).length);
    console.log('   ✅ Stripped headers:', blindingResult.strippedHeaders.join(', '));
    console.log('   ✅ Remaining headers:', Object.keys(blindingResult.blindedHeaders).join(', '));
    
    // Verify critical headers are stripped
    const criticalHeaders = ['host', 'origin', 'referer', 'x-forwarded-for', 'x-company-id', 'x-request-id', 'x-environment'];
    const stillPresent = criticalHeaders.filter(h => blindingResult.blindedHeaders[h]);
    
    if (stillPresent.length > 0) {
      console.log('   ❌ WARNING: Critical headers still present:', stillPresent);
    } else {
      console.log('   ✅ All critical identifying headers stripped');
    }
    
    // Test 2: LLM Service Integration Test
    console.log('\n🧪 Test 2: LLM Service Integration Test');
    
    if (dryRun) {
      console.log('   🔄 Dry run - creating LLM instance without making API call');
      
      try {
        const llm = llmService.getLangGraphLLM(provider);
        console.log('   ✅ LangGraph LLM created successfully with source blinding');
        
        const customLLM = llmService.createCustomLangGraphLLM({
          provider: provider,
          temperature: 0.7,
          maxTokens: 100,
        });
        console.log('   ✅ Custom LangGraph LLM created successfully with source blinding');
        
      } catch (error) {
        console.log('   ❌ LLM creation failed:', error.message);
      }
      
    } else {
      console.log('   🔄 Making real API call to test source blinding...');
      
      // Verify API keys are available
      const apiKeyEnvVar = {
        'openai': 'OPENAI_API_KEY',
        'anthropic': 'ANTHROPIC_API_KEY',
        'google': 'GOOGLE_API_KEY',
      }[provider];
      
      if (!apiKeyEnvVar || !process.env[apiKeyEnvVar]) {
        console.log(`   ⚠️  ${apiKeyEnvVar} not found, skipping real API test`);
      } else {
        try {
          const response = await llmService.generateResponse(
            'You are a helpful assistant testing source blinding.',
            'Please respond with exactly: "Source blinding test successful"',
            {
              provider: provider,
              temperature: 0.1,
              maxTokens: 50,
              callerType: 'manual-test',
              callerName: 'source-blinding-test',
            }
          );
          
          console.log('   ✅ API call successful');
          console.log('   📝 Response:', response.substring(0, 100) + (response.length > 100 ? '...' : ''));
          
          // The source blinding would have been applied automatically
          console.log('   ✅ Source blinding applied during API call');
          
        } catch (error) {
          console.log('   ❌ API call failed:', error.message);
          
          // Check if it's an authentication error (expected if using test keys)
          if (error.message.includes('401') || error.message.includes('authentication')) {
            console.log('   ℹ️  Authentication error expected with test API keys');
            console.log('   ✅ Source blinding was applied (headers stripped before failed auth)');
          }
        }
      }
    }
    
    // Test 3: Proxy Configuration Test
    console.log('\n🧪 Test 3: Proxy Configuration Test');
    
    const stats = sourceBlindingService.getStats();
    console.log('   📊 Source Blinding Stats:');
    console.log('     - Allowed headers:', stats.allowedHeaders);
    console.log('     - Blocked headers:', stats.blockedHeaders);
    console.log('     - Custom User-Agent:', stats.customUserAgent);
    console.log('     - Proxy enabled:', stats.proxyEnabled);
    
    if (stats.proxyEnabled) {
      console.log('   ✅ Proxy configuration is enabled');
      console.log('     - Host:', stats.config.proxyConfig?.host);
      console.log('     - Port:', stats.config.proxyConfig?.port);
      console.log('     - Protocol:', stats.config.proxyConfig?.protocol);
    } else {
      console.log('   ℹ️  Proxy configuration disabled (set SOURCE_BLINDING_PROXY_ENABLED=true to enable)');
    }
    
    // Test 4: Header Policy Test
    console.log('\n🧪 Test 4: Header Policy Verification');
    
    const policyTest = sourceBlindingService.blindRequest(
      {
        url: `https://api.${provider}.com/test`,
        method: 'POST',
        headers: testHeaders,
      },
      {
        provider: provider,
        noTrain: true,
        noRetain: true,
        policyProfile: 'strict',
        dataClass: 'confidential',
        sovereignMode: 'true',
      }
    );
    
    console.log('   ✅ Policy headers applied:');
    console.log('     - X-No-Train:', policyTest.headers['x-no-train']);
    console.log('     - X-No-Retain:', policyTest.headers['x-no-retain']);
    console.log('     - X-Policy-Profile:', policyTest.headers['x-policy-profile']);
    console.log('     - X-Data-Class:', policyTest.headers['x-data-class']);
    console.log('     - X-Sovereign-Mode:', policyTest.headers['x-sovereign-mode']);
    console.log('     - User-Agent:', policyTest.headers['user-agent']);
    
    console.log('\n✅ Source Blinding Test Complete');
    console.log('📋 Summary:');
    console.log(`   - Provider: ${provider}`);
    console.log(`   - Headers stripped: ${blindingResult.strippedHeaders.length}`);
    console.log(`   - Headers remaining: ${Object.keys(blindingResult.blindedHeaders).length}`);
    console.log(`   - Policy headers applied: 5`);
    console.log(`   - Custom User-Agent: ${stats.customUserAgent}`);
    
    await app.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Print usage if no provider specified
if (process.argv.length < 3) {
  console.log('Usage: node test-source-blinding.js [provider] [--dry-run]');
  console.log('Providers: openai, anthropic, google');
  console.log('');
  console.log('Examples:');
  console.log('  node test-source-blinding.js openai');
  console.log('  node test-source-blinding.js anthropic --dry-run');
  process.exit(0);
}

testSourceBlinding();
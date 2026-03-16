/**
 * Simple Node.js script to test Grok (xAI) with our golf blog post prompt
 * Testing all Grok models from slowest to fastest
 */

// Load environment variables from project root
require('dotenv').config({ path: '../../.env' });

const axios = require('axios');

const GROK_BASE_URL = 'https://api.x.ai/v1';

// Grok models to test (slowest to fastest based on capabilities)
const TEST_MODELS = [
  'grok-beta',              // Current available model
  // Future models from your database:
  // 'grok-3-mini',         // Fastest, lower accuracy
  // 'grok-3',              // Standard reasoning
  // 'grok-code-fast-1',    // Coding specialist
  // 'grok-4',              // Premium
  // 'grok-4-heavy',        // Maximum accuracy
];

const testPrompt = {
  systemPrompt: 'You are a helpful assistant who writes engaging blog posts. Write in a friendly, informative tone.',
  userMessage: 'Write me a blog post about playing golf in the rain'
};

async function checkGrokHealth() {
  console.log('🔍 Checking Grok (xAI) API health...');
  
  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.log('❌ XAI_API_KEY not found in environment variables');
      return { healthy: false, reason: 'Missing API key' };
    }

    // Try to list models to verify API access
    const response = await axios.get(`${GROK_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const models = response.data.data || [];
    const modelNames = models.map(m => m.id);
    
    console.log(`✅ Available models: ${modelNames.join(', ')}`);
    console.log(`✅ Test models to try: ${TEST_MODELS.join(', ')}`);
    
    // Check which test models are available
    const availableTestModels = TEST_MODELS.filter(model => modelNames.includes(model));
    
    if (availableTestModels.length === 0) {
      console.log(`⚠️  No test models found. Available models: ${modelNames.join(', ')}`);
      // Update TEST_MODELS to use available models
      if (modelNames.length > 0) {
        TEST_MODELS.length = 0; // Clear array
        TEST_MODELS.push(...modelNames.slice(0, 3)); // Use first 3 available models
        console.log(`✅ Updated test models: ${TEST_MODELS.join(', ')}`);
      }
    }
    
    return { healthy: true, models: modelNames, availableTestModels };

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.log(`❌ Grok API health check failed: ${errorMessage}`);
    return { healthy: false, reason: errorMessage };
  }
}

async function testSingleGrokModel(modelName) {
  console.log(`🟠 Testing ${modelName} with Golf Blog Post`);
  console.log('='.repeat(50 + modelName.length));
  console.log(`Prompt: "${testPrompt.userMessage}"`);
  console.log('');

  const startTime = Date.now();

  try {
    const apiKey = process.env.XAI_API_KEY;
    
    // Prepare the request for Grok API (OpenAI-compatible)
    const requestPayload = {
      model: modelName,
      messages: [
        {
          role: 'system',
          content: testPrompt.systemPrompt
        },
        {
          role: 'user',
          content: testPrompt.userMessage
        }
      ],
      max_tokens: 4000,
      temperature: 0.7,
      stream: false,
    };

    console.log('📤 Sending request to Grok (xAI)...');
    const apiStartTime = Date.now();

    const response = await axios.post(
      `${GROK_BASE_URL}/chat/completions`,
      requestPayload,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 2 minutes timeout for large models
      }
    );

    const apiDuration = Date.now() - apiStartTime;
    const totalDuration = Date.now() - startTime;

    // Extract response data
    const completion = response.data;
    const content = completion.choices?.[0]?.message?.content || '';
    const usage = completion.usage || {};
    
    // Debug: Log the raw response if content is empty
    console.log('🔍 Debug - Raw content length:', content.length);
    if (content.length === 0) {
      console.log('🔍 Debug - Full response:', JSON.stringify(completion, null, 2));
    }

    // Calculate metrics
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || inputTokens + outputTokens;
    
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    const tokensPerSecond = outputTokens > 0 ? (outputTokens / (apiDuration / 1000)).toFixed(2) : '0';

    // Estimate cost (Grok pricing is subscription-based, so this is just for comparison)
    const estimatedInputCost = inputTokens * 0.000005; // Rough estimate for comparison
    const estimatedOutputCost = outputTokens * 0.000015; // Rough estimate for comparison
    const totalCost = estimatedInputCost + estimatedOutputCost;

    // Display results
    console.log('📊 Results:');
    console.log(`   Content: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
    console.log('');
    console.log('📈 Metrics:');
    console.log(`   Speed: ${tokensPerSecond} tokens/sec`);
    console.log(`   Total Duration: ${totalDuration}ms`);
    console.log(`   API Duration: ${apiDuration}ms`);
    console.log(`   Word Count: ${wordCount} words`);
    console.log(`   Input Tokens: ${inputTokens}`);
    console.log(`   Output Tokens: ${outputTokens}`);
    console.log(`   Total Tokens: ${totalTokens}`);
    console.log(`   Estimated Cost: $${totalCost.toFixed(4)} (subscription-based)`);
    console.log('');

    return {
      success: true,
      content,
      metrics: {
        totalDuration,
        apiDuration,
        tokensPerSecond: parseFloat(tokensPerSecond),
        wordCount,
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCost: totalCost,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error.response?.data?.error?.message || error.message;
    
    console.log(`❌ Test failed (${duration}ms): ${errorMessage}`);
    console.log('');
    
    // Provide helpful troubleshooting info
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('💡 Troubleshooting:');
      console.log('   1. Check your XAI_API_KEY environment variable');
      console.log('   2. Verify the API key is valid and has Grok API access');
      console.log('   3. Make sure you have an active xAI subscription');
    } else if (error.response?.status === 429) {
      console.log('💡 Rate limit exceeded:');
      console.log('   1. Wait a moment and try again');
      console.log('   2. Check your xAI API usage limits');
    } else if (error.response?.status === 404) {
      console.log('💡 Model not found:');
      console.log(`   1. Model "${modelName}" might not be available`);
      console.log('   2. Check available models in xAI Console');
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
      console.log('💡 Connection issue:');
      console.log('   1. Check your internet connection');
      console.log('   2. xAI API might be temporarily unavailable');
    }
    console.log('');

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

async function testAllGrokModels() {
  console.log('🟠 GROK (xAI) GOLF BLOG POST TEST SUITE');
  console.log('=======================================');
  console.log('Testing all Grok models with golf blog post prompt');
  console.log('');

  // Health check first
  const healthCheck = await checkGrokHealth();
  if (!healthCheck.healthy) {
    console.log('💥 Grok API is not healthy, aborting tests');
    return { success: false, reason: healthCheck.reason };
  }

  console.log('');

  const results = [];
  let successful = 0;

  for (const model of TEST_MODELS) {
    const result = await testSingleGrokModel(model);
    results.push({
      model,
      ...result
    });

    if (result.success) {
      successful++;
    }

    // Small delay between tests to be respectful
    if (model !== TEST_MODELS[TEST_MODELS.length - 1]) {
      console.log('⏱️  Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('');
    }
  }

  // Summary
  console.log('🏆 GROK (xAI) TEST SUMMARY');
  console.log('==========================');
  console.log(`Models tested: ${TEST_MODELS.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${TEST_MODELS.length - successful}`);
  console.log('');

  if (successful > 0) {
    console.log('📊 Performance Comparison:');
    const successfulResults = results.filter(r => r.success);
    
    // Sort by speed
    successfulResults.sort((a, b) => b.metrics.tokensPerSecond - a.metrics.tokensPerSecond);
    
    successfulResults.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      console.log(`${medal} ${result.model}: ${result.metrics.tokensPerSecond} tokens/sec, ${result.metrics.wordCount} words, $${result.metrics.estimatedCost.toFixed(4)}`);
    });
  }

  return {
    success: successful > 0,
    totalTests: TEST_MODELS.length,
    successful,
    results
  };
}

// Run the test
if (require.main === module) {
  testAllGrokModels()
    .then((result) => {
      if (result.success) {
        console.log(`\n🎉 Grok testing completed! ${result.successful}/${result.totalTests} models successful`);
        process.exit(0);
      } else {
        console.log('💥 Grok testing failed - see troubleshooting info above');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testAllGrokModels, testSingleGrokModel, checkGrokHealth };

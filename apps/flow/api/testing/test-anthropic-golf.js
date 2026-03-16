/**
 * Simple Node.js script to test Anthropic Claude with our golf blog post prompt
 * Testing all Anthropic models from slowest to fastest
 */

// Load environment variables from project root
require('dotenv').config({ path: '../../.env' });

const axios = require('axios');

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

// Anthropic Claude models to test (slowest to fastest based on capabilities)
const TEST_MODELS = [
  'claude-3-5-haiku-20241022',  // Fast, cost-effective
  'claude-3-5-sonnet-20241022', // Balanced reasoning (current best)
  'claude-3-opus-20240229',     // Legacy but powerful
  // Note: claude-4 models might not be available yet
];

const testPrompt = {
  systemPrompt: 'You are a helpful assistant who writes engaging blog posts. Write in a friendly, informative tone.',
  userMessage: 'Write me a blog post about playing golf in the rain'
};

async function checkAnthropicHealth() {
  console.log('🔍 Checking Anthropic Claude API health...');
  
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('❌ ANTHROPIC_API_KEY not found in environment variables');
      return { healthy: false, reason: 'Missing API key' };
    }

    // Try a simple request to verify API access
    const response = await axios.post(
      `${ANTHROPIC_BASE_URL}/messages`,
      {
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 10000,
      }
    );

    console.log(`✅ Anthropic API is healthy`);
    console.log(`✅ Test models to try: ${TEST_MODELS.join(', ')}`);
    
    return { healthy: true, models: TEST_MODELS };

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.log(`❌ Anthropic API health check failed: ${errorMessage}`);
    return { healthy: false, reason: errorMessage };
  }
}

async function testSingleAnthropicModel(modelName) {
  console.log(`🟣 Testing ${modelName} with Golf Blog Post`);
  console.log('='.repeat(50 + modelName.length));
  console.log(`Prompt: "${testPrompt.userMessage}"`);
  console.log('');

  const startTime = Date.now();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    // Prepare the request for Anthropic Claude API
    const requestPayload = {
      model: modelName,
      max_tokens: 4000,
      temperature: 0.7,
      system: testPrompt.systemPrompt,
      messages: [
        {
          role: 'user',
          content: testPrompt.userMessage
        }
      ]
    };

    console.log('📤 Sending request to Anthropic Claude...');
    const apiStartTime = Date.now();

    const response = await axios.post(
      `${ANTHROPIC_BASE_URL}/messages`,
      requestPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 120000, // 2 minutes timeout for large models
      }
    );

    const apiDuration = Date.now() - apiStartTime;
    const totalDuration = Date.now() - startTime;

    // Extract response data
    const completion = response.data;
    const content = completion.content?.[0]?.text || '';
    const usage = completion.usage || {};
    
    // Debug: Log the raw response if content is empty
    console.log('🔍 Debug - Raw content length:', content.length);
    if (content.length === 0) {
      console.log('🔍 Debug - Full response:', JSON.stringify(completion, null, 2));
    }

    // Calculate metrics
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;
    
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    const tokensPerSecond = outputTokens > 0 ? (outputTokens / (apiDuration / 1000)).toFixed(2) : '0';

    // Estimate cost based on model (rough estimates)
    let inputCostPerToken, outputCostPerToken;
    if (modelName.includes('haiku')) {
      inputCostPerToken = 0.00000025; // $0.25 per million input tokens
      outputCostPerToken = 0.00000125; // $1.25 per million output tokens
    } else if (modelName.includes('sonnet')) {
      inputCostPerToken = 0.000003; // $3 per million input tokens
      outputCostPerToken = 0.000015; // $15 per million output tokens
    } else if (modelName.includes('opus')) {
      inputCostPerToken = 0.000015; // $15 per million input tokens
      outputCostPerToken = 0.000075; // $75 per million output tokens
    } else {
      // Default estimates
      inputCostPerToken = 0.000003;
      outputCostPerToken = 0.000015;
    }
    
    const estimatedInputCost = inputTokens * inputCostPerToken;
    const estimatedOutputCost = outputTokens * outputCostPerToken;
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
    console.log(`   Estimated Cost: $${totalCost.toFixed(4)}`);
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
      console.log('   1. Check your ANTHROPIC_API_KEY environment variable');
      console.log('   2. Verify the API key is valid and has Claude API access');
      console.log('   3. Make sure the API key has sufficient credits');
    } else if (error.response?.status === 429) {
      console.log('💡 Rate limit exceeded:');
      console.log('   1. Wait a moment and try again');
      console.log('   2. Check your Anthropic API usage limits');
    } else if (error.response?.status === 404) {
      console.log('💡 Model not found:');
      console.log(`   1. Model "${modelName}" might not be available`);
      console.log('   2. Check available models in Anthropic Console');
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
      console.log('💡 Connection issue:');
      console.log('   1. Check your internet connection');
      console.log('   2. Anthropic API might be temporarily unavailable');
    }
    console.log('');

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

async function testAllAnthropicModels() {
  console.log('🟣 ANTHROPIC CLAUDE GOLF BLOG POST TEST SUITE');
  console.log('=============================================');
  console.log('Testing all Anthropic models with golf blog post prompt');
  console.log('');

  // Health check first
  const healthCheck = await checkAnthropicHealth();
  if (!healthCheck.healthy) {
    console.log('💥 Anthropic API is not healthy, aborting tests');
    return { success: false, reason: healthCheck.reason };
  }

  console.log('');

  const results = [];
  let successful = 0;

  for (const model of TEST_MODELS) {
    const result = await testSingleAnthropicModel(model);
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
  console.log('🏆 ANTHROPIC CLAUDE TEST SUMMARY');
  console.log('================================');
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
  testAllAnthropicModels()
    .then((result) => {
      if (result.success) {
        console.log(`\n🎉 Anthropic testing completed! ${result.successful}/${result.totalTests} models successful`);
        process.exit(0);
      } else {
        console.log('💥 Anthropic testing failed - see troubleshooting info above');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testAllAnthropicModels, testSingleAnthropicModel, checkAnthropicHealth };

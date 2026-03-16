/**
 * Simple Node.js script to test Google Gemini with our golf blog post prompt
 * Testing all Google models from slowest to fastest
 */

// Load environment variables from project root
require('dotenv').config({ path: '../../.env' });

const axios = require('axios');

const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Google Gemini models to test (slowest to fastest based on capabilities)
const TEST_MODELS = [
  'gemini-2.0-flash-exp',     // Flash experimental - working great!
  // 'gemini-2.0-pro-exp',   // ❌ REMOVED - quota issues for demo users (removed from DB)
  'gemini-2.5-flash',        // Fast with audio
  'gemini-2.5-pro',          // Premium flagship
];

const testPrompt = {
  systemPrompt: 'You are a helpful assistant who writes engaging blog posts. Write in a friendly, informative tone.',
  userMessage: 'Write me a blog post about playing golf in the rain'
};

async function checkGoogleHealth() {
  console.log('🔍 Checking Google Gemini API health...');
  
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.log('❌ GOOGLE_API_KEY not found in environment variables');
      return { healthy: false, reason: 'Missing API key' };
    }

    // Try to list models to verify API access
    const response = await axios.get(`${GOOGLE_BASE_URL}/models`, {
      params: { key: apiKey },
      timeout: 10000,
    });

    const models = response.data.models || [];
    const modelNames = models.map(m => m.name.replace('models/', ''));
    
    // Check which test models are available
    const availableTestModels = TEST_MODELS.filter(model => 
      modelNames.some(name => name.includes(model) || model.includes(name))
    );
    
    console.log(`✅ Available test models: ${availableTestModels.join(', ')}`);
    if (availableTestModels.length === 0) {
      console.log(`⚠️  No test models found. Available models: ${modelNames.slice(0, 10).join(', ')}...`);
    }
    
    return { healthy: true, models: modelNames, availableTestModels };

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.log(`❌ Google API health check failed: ${errorMessage}`);
    return { healthy: false, reason: errorMessage };
  }
}

async function testSingleGoogleModel(modelName) {
  console.log(`🟢 Testing ${modelName} with Golf Blog Post`);
  console.log('='.repeat(50 + modelName.length));
  console.log(`Prompt: "${testPrompt.userMessage}"`);
  console.log('');

  const startTime = Date.now();

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    
    // Prepare the request for Google Gemini API
    const requestPayload = {
      contents: [
        {
          parts: [
            {
              text: `${testPrompt.systemPrompt}\n\n${testPrompt.userMessage}`
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 4000,
        temperature: 0.7,
      }
    };

    console.log('📤 Sending request to Google Gemini...');
    const apiStartTime = Date.now();

    const response = await axios.post(
      `${GOOGLE_BASE_URL}/models/${modelName}:generateContent`,
      requestPayload,
      {
        params: { key: apiKey },
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 2 minutes timeout for large models
      }
    );

    const apiDuration = Date.now() - apiStartTime;
    const totalDuration = Date.now() - startTime;

    // Extract response data
    const completion = response.data;
    const content = completion.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = completion.usageMetadata || {};
    
    // Debug: Log the raw response if content is empty
    console.log('🔍 Debug - Raw content length:', content.length);
    if (content.length === 0) {
      console.log('🔍 Debug - Full response:', JSON.stringify(completion, null, 2));
    }

    // Calculate metrics
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    const totalTokens = usage.totalTokenCount || inputTokens + outputTokens;
    
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    const tokensPerSecond = outputTokens > 0 ? (outputTokens / (apiDuration / 1000)).toFixed(2) : '0';

    // Estimate cost (using rough estimates for Google models)
    const estimatedInputCost = inputTokens * 0.000025; // Rough estimate
    const estimatedOutputCost = outputTokens * 0.000075; // Rough estimate
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
      console.log('   1. Check your GOOGLE_API_KEY environment variable');
      console.log('   2. Verify the API key is valid and has Gemini API access');
      console.log('   3. Make sure the API key has sufficient quota');
    } else if (error.response?.status === 429) {
      console.log('💡 Rate limit exceeded:');
      console.log('   1. Wait a moment and try again');
      console.log('   2. Check your Google API usage limits');
    } else if (error.response?.status === 404) {
      console.log('💡 Model not found:');
      console.log(`   1. Model "${modelName}" might not be available`);
      console.log('   2. Check available models in Google AI Studio');
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
      console.log('💡 Connection issue:');
      console.log('   1. Check your internet connection');
      console.log('   2. Google API might be temporarily unavailable');
    }
    console.log('');

    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

async function testAllGoogleModels() {
  console.log('🟢 GOOGLE GEMINI GOLF BLOG POST TEST SUITE');
  console.log('==========================================');
  console.log('Testing all Google models with golf blog post prompt');
  console.log('');

  // Health check first
  const healthCheck = await checkGoogleHealth();
  if (!healthCheck.healthy) {
    console.log('💥 Google API is not healthy, aborting tests');
    return { success: false, reason: healthCheck.reason };
  }

  console.log('');

  const results = [];
  let successful = 0;

  for (const model of TEST_MODELS) {
    const result = await testSingleGoogleModel(model);
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
  console.log('🏆 GOOGLE GEMINI TEST SUMMARY');
  console.log('============================');
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
  testAllGoogleModels()
    .then((result) => {
      if (result.success) {
        console.log(`\n🎉 Google testing completed! ${result.successful}/${result.totalTests} models successful`);
        process.exit(0);
      } else {
        console.log('💥 Google testing failed - see troubleshooting info above');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testAllGoogleModels, testSingleGoogleModel, checkGoogleHealth };

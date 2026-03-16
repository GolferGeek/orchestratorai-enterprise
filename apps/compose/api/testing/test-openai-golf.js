/**
 * Simple Node.js script to test OpenAI with our golf blog post prompt
 * This bypasses NestJS complexity and tests the core functionality directly
 * Starting with o1-mini and working up the model hierarchy
 */

// Load environment variables from project root
require('dotenv').config({ path: '../../.env' });

const axios = require('axios');

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// OpenAI models to test (starting from bottom up)
const TEST_MODELS = [
  'o1-mini',           // ✅ TESTED - 192.55 tokens/sec, $0.0171, 775 words
  // 'o1-preview',     // ❌ REMOVED - not available in most accounts (removed from DB)
  'gpt-4o-mini',       // ✅ TESTED - 66.62 tokens/sec, $0.0005, 663 words
  'gpt-4o',            // ✅ TESTED - 62.62 tokens/sec, $0.0069, 560 words
  'gpt-5',             // ✅ TESTED - 69.05 tokens/sec, $0.0687, 1330 words
];

const testPrompt = {
  systemPrompt: 'You are a helpful assistant who writes engaging blog posts. Write in a friendly, informative tone.',
  userMessage: 'Write me a blog post about playing golf in the rain'
};

async function checkOpenAIHealth() {
  try {
    console.log('🏥 Checking OpenAI API health...');
    
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      return { healthy: false, reason: 'OPENAI_API_KEY environment variable not set' };
    }
    
    // Test API connection with a simple models list call
    const response = await axios.get(`${OPENAI_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    
    const models = response.data.data || [];
    const modelNames = models.map(m => m.id).sort();
    
    console.log(`✅ OpenAI API is accessible`);
    console.log(`📋 Available models: ${modelNames.length} total`);
    
    // Check which test models are available
    const availableTestModels = TEST_MODELS.filter(model => 
      modelNames.some(available => available.includes(model))
    );
    const missingModels = TEST_MODELS.filter(model => 
      !modelNames.some(available => available.includes(model))
    );
    
    console.log(`✅ Available test models: ${availableTestModels.join(', ')}`);
    if (missingModels.length > 0) {
      console.log(`⚠️  Missing models: ${missingModels.join(', ')}`);
    }
    
    if (availableTestModels.length === 0) {
      return { healthy: false, reason: 'No test models available' };
    }
    
    return { healthy: true, models: modelNames, availableTestModels, missingModels };
    
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('❌ Invalid OpenAI API key');
      return { healthy: false, reason: 'Invalid API key' };
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.log('❌ Cannot connect to OpenAI API');
      return { healthy: false, reason: 'Network connection failed' };
    } else {
      console.log(`❌ OpenAI health check failed: ${error.message}`);
      return { healthy: false, reason: error.message };
    }
  }
}

async function testSingleOpenAIModel(modelName) {
  console.log(`🏌️ Testing ${modelName} with Golf Blog Post`);
  console.log('='.repeat(50 + modelName.length));
  console.log(`Prompt: "${testPrompt.userMessage}"`);
  console.log('');

  const startTime = Date.now();
  
  try {
    // Check health first
    const health = await checkOpenAIHealth();
    if (!health.healthy) {
      throw new Error(`OpenAI health check failed: ${health.reason}`);
    }
    console.log('');

    // Prepare the request - o1 and GPT-5 models have different API format
    const isO1Model = modelName.startsWith('o1');
    const isGPT5Model = modelName.startsWith('gpt-5');
    
    let requestPayload;
    if (isO1Model || isGPT5Model) {
      // o1 and GPT-5 models use max_completion_tokens and may have different requirements
      if (isO1Model) {
        // o1 models don't support system messages or temperature
        requestPayload = {
          model: modelName,
          messages: [
            {
              role: 'user',
              content: `${testPrompt.systemPrompt}\n\n${testPrompt.userMessage}`
            }
          ],
          max_completion_tokens: 4000,
        };
      } else {
        // GPT-5 supports system messages but uses max_completion_tokens and only default temperature
        requestPayload = {
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
          max_completion_tokens: 4000,
          // GPT-5 only supports default temperature (1), so we omit it
        };
      }
    } else {
      // Standard chat completion format for gpt-4o, gpt-4o-mini, etc.
      requestPayload = {
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
        max_tokens: 1000,
        temperature: 0.7,
      };
    }

    console.log('🤖 Generating blog post...');
    console.log('⏳ This may take 30-60 seconds...');

    // Make the API call
    const apiStartTime = Date.now();
    const response = await axios.post(`${OPENAI_BASE_URL}/chat/completions`, requestPayload, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000, // 2 minute timeout for o1 models
    });
    const apiEndTime = Date.now();

    console.log('✅ Success!');
    console.log('');

    // Extract response data
    const completion = response.data;
    const content = completion.choices[0].message.content || '';
    const usage = completion.usage || {};
    
    // Debug: Log the raw response to see what we're getting
    console.log('🔍 Debug - Raw content length:', content.length);
    if (content.length === 0) {
      console.log('🔍 Debug - Full response:', JSON.stringify(completion, null, 2));
    }
    
    // Calculate metrics
    const totalDuration = Date.now() - startTime;
    const apiDuration = apiEndTime - apiStartTime;
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || (inputTokens + outputTokens);
    const tokensPerSecond = outputTokens > 0 ? (outputTokens / (apiDuration / 1000)).toFixed(2) : 'N/A';
    const wordCount = content.split(/\s+/).length;
    
    // Calculate cost (approximate - update with actual pricing)
    let inputCostPer1K, outputCostPer1K;
    switch (modelName) {
      case 'o1-mini':
        inputCostPer1K = 3.00;  // $3.00 per 1M tokens = $0.003 per 1K
        outputCostPer1K = 12.00; // $12.00 per 1M tokens = $0.012 per 1K
        break;
      case 'o1-preview':
        inputCostPer1K = 15.00;  // $15.00 per 1M tokens
        outputCostPer1K = 60.00; // $60.00 per 1M tokens
        break;
      case 'gpt-4o-mini':
        inputCostPer1K = 0.15;   // $0.15 per 1M tokens
        outputCostPer1K = 0.60;  // $0.60 per 1M tokens
        break;
      case 'gpt-4o':
        inputCostPer1K = 2.50;   // $2.50 per 1M tokens
        outputCostPer1K = 10.00; // $10.00 per 1M tokens
        break;
      case 'gpt-5':
        inputCostPer1K = 5.00;   // Estimated - update when official pricing available
        outputCostPer1K = 20.00; // Estimated
        break;
      default:
        inputCostPer1K = 0;
        outputCostPer1K = 0;
    }
    
    const inputCost = (inputTokens / 1000) * (inputCostPer1K / 1000);
    const outputCost = (outputTokens / 1000) * (outputCostPer1K / 1000);
    const totalCost = inputCost + outputCost;

    // Display metrics
    console.log('📊 Metrics:');
    console.log(`   Total duration: ${totalDuration}ms`);
    console.log(`   API call duration: ${apiDuration}ms`);
    console.log(`   Input tokens: ${inputTokens}`);
    console.log(`   Output tokens: ${outputTokens}`);
    console.log(`   Total tokens: ${totalTokens}`);
    console.log(`   Tokens/sec: ${tokensPerSecond}`);
    console.log(`   Word count: ${wordCount}`);
    console.log(`   Cost: $${totalCost.toFixed(4)} (input: $${inputCost.toFixed(4)}, output: $${outputCost.toFixed(4)})`);
    console.log('');

    // Display OpenAI-specific details
    console.log('🔧 OpenAI Response Details:');
    console.log(`   Model: ${completion.model}`);
    console.log(`   Finish reason: ${completion.choices[0].finish_reason}`);
    if (completion.system_fingerprint) {
      console.log(`   System fingerprint: ${completion.system_fingerprint}`);
    }
    console.log('');

    // Display the generated content
    console.log('📝 Generated Blog Post:');
    console.log('========================');
    console.log(content);
    console.log('========================');
    console.log('');

    return {
      success: true,
      model: modelName,
      content,
      metrics: {
        totalDuration,
        apiDuration,
        tokensPerSecond: parseFloat(tokensPerSecond),
        wordCount,
        inputTokens,
        outputTokens,
        totalTokens,
        cost: totalCost,
        inputCost,
        outputCost,
      },
      openaiDetails: {
        model: completion.model,
        finishReason: completion.choices[0].finish_reason,
        systemFingerprint: completion.system_fingerprint,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error.message || 'Unknown error';
    
    console.log(`❌ Test failed (${duration}ms): ${errorMessage}`);
    
    // Enhanced debugging for GPT-5 and other errors
    if (error.response) {
      console.log(`🔍 Debug - HTTP Status: ${error.response.status}`);
      console.log(`🔍 Debug - Response Data:`, JSON.stringify(error.response.data, null, 2));
      console.log(`🔍 Debug - Request Model: ${modelName}`);
    }
    console.log('');
    
    // Provide helpful troubleshooting info
    if (error.response?.status === 400) {
      console.log('💡 Bad Request (400) - Possible issues:');
      console.log(`   1. Model "${modelName}" may not exist or be available`);
      console.log('   2. Request format may be incorrect for this model');
      console.log('   3. Model may require different parameters');
      console.log('   4. Check if this is a beta/preview model requiring special access');
    } else if (error.response?.status === 401) {
      console.log('💡 Troubleshooting:');
      console.log('   1. Check your OPENAI_API_KEY environment variable');
      console.log('   2. Verify the API key is valid and has sufficient credits');
      console.log('   3. Make sure the API key has access to the requested model');
    } else if (error.response?.status === 429) {
      console.log('💡 Rate limit exceeded:');
      console.log('   1. Wait a moment and try again');
      console.log('   2. Check your OpenAI usage limits');
    } else if (error.response?.status === 404) {
      console.log('💡 Model not found:');
      console.log(`   1. Model "${modelName}" may not be available to your account`);
      console.log('   2. Check if you have access to this model');
    }

    return {
      success: false,
      model: modelName,
      error: errorMessage,
      metrics: {
        totalDuration: duration,
      },
    };
  }
}

async function testAllOpenAIModels() {
  console.log('🏌️ Testing OpenAI Models with Golf Blog Post Prompt');
  console.log('===================================================');
  console.log(`Prompt: "${testPrompt.userMessage}"`);
  console.log('');

  // Check health and get available models
  const health = await checkOpenAIHealth();
  if (!health.healthy) {
    console.log(`❌ Cannot proceed: ${health.reason}`);
    return { success: false, reason: health.reason };
  }

  const availableModels = health.availableTestModels;
  console.log(`🎯 Testing ${availableModels.length} models: ${availableModels.join(', ')}`);
  console.log('');

  const results = [];
  
  for (let i = 0; i < availableModels.length; i++) {
    const model = availableModels[i];
    console.log(`\n📍 Test ${i + 1}/${availableModels.length}: ${model}`);
    console.log('-'.repeat(60));
    
    const result = await testSingleOpenAIModel(model);
    results.push(result);
    
    // Add a pause between tests to respect rate limits
    if (i < availableModels.length - 1) {
      console.log('\n⏳ Pausing 3 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY: OpenAI Models Golf Blog Post Test');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  console.log('');
  
  if (successful.length > 0) {
    console.log('🏆 Performance Ranking (by tokens/sec):');
    successful
      .sort((a, b) => (b.metrics.tokensPerSecond || 0) - (a.metrics.tokensPerSecond || 0))
      .forEach((result, index) => {
        const { model, metrics } = result;
        console.log(`${index + 1}. ${model}: ${metrics.tokensPerSecond?.toFixed(2) || 'N/A'} tokens/sec (${metrics.totalDuration}ms, ${metrics.wordCount} words)`);
      });
    console.log('');
    
    console.log('💰 Cost Comparison:');
    successful
      .sort((a, b) => (a.metrics.cost || 0) - (b.metrics.cost || 0))
      .forEach((result, index) => {
        const { model, metrics } = result;
        console.log(`${index + 1}. ${model}: $${metrics.cost?.toFixed(4) || '0.0000'}`);
      });
    console.log('');
    
    console.log('📝 Content Quality (word count):');
    successful
      .sort((a, b) => (b.metrics.wordCount || 0) - (a.metrics.wordCount || 0))
      .forEach((result, index) => {
        const { model, metrics } = result;
        console.log(`${index + 1}. ${model}: ${metrics.wordCount} words`);
      });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach(result => {
      console.log(`   ${result.model}: ${result.error}`);
    });
  }
  
  console.log('\n🎯 Comparison with Ollama:');
  console.log('   Ollama llama3.2:1b: 109.91 tokens/sec, $0.0000, 474 words');
  console.log('   Ollama qwen3:8b: 43.70 tokens/sec, $0.0000, 751 words');
  
  if (successful.length > 0) {
    const fastest = successful.reduce((prev, current) => 
      (prev.metrics.tokensPerSecond || 0) > (current.metrics.tokensPerSecond || 0) ? prev : current
    );
    const cheapest = successful.reduce((prev, current) => 
      (prev.metrics.cost || Infinity) < (current.metrics.cost || Infinity) ? prev : current
    );
    const mostWords = successful.reduce((prev, current) => 
      (prev.metrics.wordCount || 0) > (current.metrics.wordCount || 0) ? prev : current
    );
    
    console.log(`   OpenAI fastest: ${fastest.model} (${fastest.metrics.tokensPerSecond?.toFixed(2)} tokens/sec)`);
    console.log(`   OpenAI cheapest: ${cheapest.model} ($${cheapest.metrics.cost?.toFixed(4)})`);
    console.log(`   OpenAI most detailed: ${mostWords.model} (${mostWords.metrics.wordCount} words)`);
  }
  
  console.log('\n🚀 Ready to test the next model up the hierarchy!');
  console.log('='.repeat(80));
  
  return {
    success: successful.length > 0,
    totalTests: results.length,
    successful: successful.length,
    failed: failed.length,
    results
  };
}

// Run the test
if (require.main === module) {
  testAllOpenAIModels()
    .then((result) => {
      if (result.success) {
        console.log(`\n🎉 Testing completed! ${result.successful}/${result.totalTests} models successful`);
        console.log('\n💡 If o1-mini worked, uncomment the next model in TEST_MODELS and run again!');
        process.exit(0);
      } else {
        console.log(`\n💥 All tests failed! ${result.failed || 0}/${result.totalTests || 0} models failed`);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testAllOpenAIModels, testSingleOpenAIModel, checkOpenAIHealth };

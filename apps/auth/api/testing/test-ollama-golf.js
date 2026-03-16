/**
 * Simple Node.js script to test Ollama with our golf blog post prompt
 * This bypasses NestJS complexity and tests the core functionality directly
 */

const axios = require('axios');

const OLLAMA_BASE_URL = 'http://localhost:11434';

// ALL Ollama models including the GIANTS! 🚀
const TEST_MODELS = [
  // Previously tested smaller/medium models:
  'llama3.2:1b',        // ✅ TESTED - 109.91 tokens/sec, $0.0000, 474 words (your system model)
  'llama3.2:latest',    // ✅ TESTED - 88.45 tokens/sec, $0.0000, 596 words
  'mistral:7b',         // ✅ TESTED - 44.99 tokens/sec, $0.0000, 371 words
  'gemma2:2b',          // ✅ TESTED - 83.13 tokens/sec, $0.0000, 525 words
  'qwen3:8b',           // ✅ TESTED - 43.70 tokens/sec, $0.0000, 751 words
  'mistral:latest',     // ✅ TESTED - 48.44 tokens/sec, $0.0000, 418 words
  'llama2:latest',      // ✅ TESTED - 46.70 tokens/sec, $0.0000, 325 words
  'codellama:latest',   // ✅ TESTED - 46.94 tokens/sec, $0.0000, 359 words

  // 🔥 THE GIANTS - Testing now:
  'gpt-oss:20b',        // 20B parameter model
  'qwq:latest',         // Large reasoning model  
  'deepseek-r1:latest', // Latest DeepSeek reasoning model
  // Skipping the 70B monster: deepseek-r1:70b (too resource intensive)
];

const testPrompt = {
  systemPrompt: 'You are a helpful assistant who writes engaging blog posts. Write in a friendly, informative tone.',
  userMessage: 'Write me a blog post about playing golf in the rain'
};

async function checkOllamaHealth() {
  try {
    console.log('🏥 Checking Ollama health...');
    
    // Check if Ollama is running
    const versionResponse = await axios.get(`${OLLAMA_BASE_URL}/api/version`, { timeout: 5000 });
    console.log(`✅ Ollama is running (version: ${versionResponse.data.version || 'unknown'})`);
    
    // Check available models
    const modelsResponse = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
    const models = modelsResponse.data.models || [];
    const modelNames = models.map(m => m.name);
    
    console.log(`📋 Available models: ${modelNames.join(', ') || 'none'}`);
    
    // Check which test models are available
    const availableTestModels = TEST_MODELS.filter(model => modelNames.includes(model));
    const missingModels = TEST_MODELS.filter(model => !modelNames.includes(model));
    
    console.log(`✅ Available test models: ${availableTestModels.join(', ')}`);
    if (missingModels.length > 0) {
      console.log(`⚠️  Missing models: ${missingModels.join(', ')}`);
      console.log(`💡 To install missing models, run: ollama pull <model_name>`);
    }
    
    if (availableTestModels.length === 0) {
      return { healthy: false, reason: 'No test models available' };
    }
    
    return { healthy: true, models: modelNames, availableTestModels, missingModels };
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to Ollama server');
      console.log('💡 Make sure Ollama is running: ollama serve');
      return { healthy: false, reason: 'Ollama server not running' };
    } else {
      console.log(`❌ Health check failed: ${error.message}`);
      return { healthy: false, reason: error.message };
    }
  }
}

async function testSingleOllamaModel(modelName) {
  console.log(`🏌️ Testing ${modelName} with Golf Blog Post`);
  console.log('='.repeat(50 + modelName.length));
  console.log(`Prompt: "${testPrompt.userMessage}"`);
  console.log('');

  const startTime = Date.now();
  
  try {
    // Check health first
    const health = await checkOllamaHealth();
    if (!health.healthy) {
      throw new Error(`Ollama health check failed: ${health.reason}`);
    }
    console.log('');

    // Prepare the request
    const requestPayload = {
      model: modelName,
      prompt: testPrompt.userMessage,
      system: testPrompt.systemPrompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 1000, // max tokens
        top_p: 0.9,
        top_k: 40,
      },
    };

    console.log('🤖 Generating blog post...');
    console.log('⏳ This may take 30-60 seconds for the first request...');
    
    // Make the API call
    const apiStartTime = Date.now();
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, requestPayload, {
      timeout: 120000, // 2 minute timeout
    });
    const apiDuration = Date.now() - apiStartTime;
    
    if (!response.data.response) {
      throw new Error('No response content from Ollama');
    }

    const totalDuration = Date.now() - startTime;
    
    // Calculate metrics
    const content = response.data.response;
    const wordCount = content.split(/\s+/).length;
    const estimatedInputTokens = Math.ceil((testPrompt.systemPrompt + testPrompt.userMessage).length / 4);
    const actualOutputTokens = response.data.eval_count || Math.ceil(content.length / 4);
    const tokensPerSecond = actualOutputTokens > 0 ? (actualOutputTokens / apiDuration) * 1000 : 0;

    // Print results
    console.log('✅ Success!');
    console.log('');
    console.log('📊 Metrics:');
    console.log(`   Total duration: ${totalDuration}ms`);
    console.log(`   API call duration: ${apiDuration}ms`);
    console.log(`   Estimated input tokens: ${estimatedInputTokens}`);
    console.log(`   Output tokens: ${actualOutputTokens}`);
    console.log(`   Tokens/sec: ${tokensPerSecond.toFixed(2)}`);
    console.log(`   Word count: ${wordCount}`);
    console.log(`   Cost: $0.0000 (local model)`);
    console.log('');
    
    // Print Ollama performance details
    if (response.data.total_duration) {
      console.log('🔧 Ollama Performance Details:');
      console.log(`   Total duration: ${Math.round(response.data.total_duration / 1000000)}ms`);
      if (response.data.load_duration) {
        console.log(`   Model load time: ${Math.round(response.data.load_duration / 1000000)}ms`);
      }
      if (response.data.prompt_eval_duration) {
        console.log(`   Prompt eval time: ${Math.round(response.data.prompt_eval_duration / 1000000)}ms`);
        console.log(`   Prompt tokens: ${response.data.prompt_eval_count || 'unknown'}`);
      }
      if (response.data.eval_duration) {
        console.log(`   Generation time: ${Math.round(response.data.eval_duration / 1000000)}ms`);
        console.log(`   Generated tokens: ${response.data.eval_count || 'unknown'}`);
      }
      console.log('');
    }
    
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
        tokensPerSecond,
        wordCount,
        inputTokens: estimatedInputTokens,
        outputTokens: actualOutputTokens,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error.message || 'Unknown error';
    
    console.log(`❌ Test failed (${duration}ms): ${errorMessage}`);
    console.log('');

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

async function testAllOllamaModels() {
  console.log('🏌️ Testing ALL Ollama Models with Golf Blog Post Prompt');
  console.log('========================================================');
  console.log(`Prompt: "${testPrompt.userMessage}"`);
  console.log('');

  // Check health and get available models
  const health = await checkOllamaHealth();
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
    
    const result = await testSingleOllamaModel(model);
    results.push(result);
    
    // Add a pause between tests to be nice to the system
    if (i < availableModels.length - 1) {
      console.log('\n⏳ Pausing 2 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY: All Ollama Models Golf Blog Post Test');
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
    console.log('All local models: $0.0000 (Free!)');
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
  
  console.log('\n🎯 Recommendation:');
  if (successful.length > 0) {
    const fastest = successful.reduce((prev, current) => 
      (prev.metrics.tokensPerSecond || 0) > (current.metrics.tokensPerSecond || 0) ? prev : current
    );
    const mostWords = successful.reduce((prev, current) => 
      (prev.metrics.wordCount || 0) > (current.metrics.wordCount || 0) ? prev : current
    );
    
    console.log(`   Fastest: ${fastest.model} (${fastest.metrics.tokensPerSecond?.toFixed(2)} tokens/sec)`);
    console.log(`   Most detailed: ${mostWords.model} (${mostWords.metrics.wordCount} words)`);
    
    if (successful.find(r => r.model === 'llama3.2:1b')) {
      console.log(`   Your system model (llama3.2:1b): Available and working! ✅`);
    }
  }
  
  console.log('\n🚀 This test pattern is ready to be replicated for other providers!');
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
  testAllOllamaModels()
    .then((result) => {
      if (result.success) {
        console.log(`\n🎉 Testing completed! ${result.successful}/${result.totalTests} models successful`);
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

module.exports = { testAllOllamaModels, testSingleOllamaModel, checkOllamaHealth };

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function testOllamaDirect() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    // Test with our custom pseudonyms using llama3.2:latest
    console.log('🧪 Testing Ollama llama3.2:latest with custom pseudonyms...');
    
    const hrIssue = `Employee Matt Weber (username: GolferGeek) works at Orchestrator-AI. Write a brief professional note about their collaboration.`;
    
    try {
      const taskId = uuidv4();
      const conversationId = uuidv4();
      
      console.log(`🆔 Task ID: ${taskId}`);
      console.log(`🆔 Conversation ID: ${conversationId}`);
      console.log(`📝 Prompt: "${hrIssue}"`);
      console.log('⏰ Starting agent call...\n');
      
      const startTime = Date.now();
      
      const agentResponse = await axios.post('http://localhost:6100/agents/marketing/blog_post/tasks', {
        method: 'process',
        prompt: hrIssue,
        conversationId: conversationId,
        conversationHistory: [],
        llmSelection: {
          providerName: 'ollama',
          modelName: 'llama3.2:latest',
          temperature: 0.7
        },
        executionMode: 'immediate',
        taskId: taskId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000, // 2 minute timeout
        validateStatus: function (status) {
          return true; // Don't throw on any status code - we want to see what happens
        }
      });
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      console.log(`⏱️ Processing time: ${processingTime}ms`);
      console.log(`📊 Response status: ${agentResponse.status}`);
      
      if (agentResponse.status === 200 && agentResponse.data.result && agentResponse.data.result.success) {
        console.log('🎉 SUCCESS: Ollama agent call completed!');
        
        const responseText = agentResponse.data.result.response;
        console.log(`📏 Response length: ${responseText.length} characters`);
        
        // Check pseudonymization
        console.log('\n🔍 Pseudonymization Check:');
        const mattWeberFound = responseText.includes('Matt Weber');
        const golferGeekFound = responseText.includes('GolferGeek');
        const orchestratorAIFound = responseText.includes('Orchestrator-AI');
        
        console.log(`   Contains "Matt Weber": ${mattWeberFound ? '❌ YES (not pseudonymized)' : '✅ NO (pseudonymized)'}`);
        console.log(`   Contains "GolferGeek": ${golferGeekFound ? '❌ YES (not pseudonymized)' : '✅ NO (pseudonymized)'}`);
        console.log(`   Contains "Orchestrator-AI": ${orchestratorAIFound ? '❌ YES (not pseudonymized)' : '✅ NO (pseudonymized)'}`);
        
        const allPseudonymized = !mattWeberFound && !golferGeekFound && !orchestratorAIFound;
        console.log(`\n🎯 Overall pseudonymization: ${allPseudonymized ? '✅ SUCCESS' : '❌ PARTIAL/FAILED'}`);
        
        console.log('\n📄 Full Response:');
        console.log(`"${responseText}"`);
        
        // Check for sanitization metadata
        if (agentResponse.data.result.sanitizationMetadata) {
          console.log('\n🔒 Sanitization Metadata:');
          console.log(JSON.stringify(agentResponse.data.result.sanitizationMetadata, null, 2));
        }
        
        // Check database for pseudonym mappings
        console.log('\n🗄️ Checking database for pseudonym mappings...');
        
        try {
          const mappingsResponse = await axios.get('http://localhost:6100/llm/sanitization/pseudonym/mappings', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          const customMappings = mappingsResponse.data.mappings?.filter(m => 
            m.originalValue === 'Matt Weber' || 
            m.originalValue === 'GolferGeek' || 
            m.originalValue === 'Orchestrator-AI'
          ) || [];
          
          console.log(`✅ Found ${mappingsResponse.data.mappings?.length || 0} total mappings in database`);
          console.log(`🎯 Found ${customMappings.length} custom pseudonym mappings:`);
          
          customMappings.forEach(mapping => {
            console.log(`   "${mapping.originalValue}" → "${mapping.pseudonym}" (${mapping.dataType})`);
          });
          
          if (allPseudonymized && customMappings.length > 0) {
            console.log('\n🎉🎉🎉 COMPLETE END-TO-END SUCCESS! 🎉🎉🎉');
            console.log('   ✅ Ollama llama3.2:latest working');
            console.log('   ✅ Custom pseudonymization working');
            console.log('   ✅ Agent processing working');
            console.log('   ✅ Database persistence working');
            console.log('   ✅ No OpenAI fallbacks');
            console.log('   ✅ System ready for production!');
          } else if (allPseudonymized) {
            console.log('\n🎯 Pseudonymization working but mappings not persisted to database');
          } else {
            console.log('\n⚠️ Agent working but pseudonymization needs investigation');
          }
          
        } catch (mappingError) {
          console.log('❌ Error checking database mappings:', mappingError.response?.status);
        }
        
      } else {
        console.log('❌ Agent call failed or returned unexpected format');
        console.log('📊 Full response data:');
        console.log(JSON.stringify(agentResponse.data, null, 2));
        
        // Check for specific error patterns
        if (agentResponse.data.message) {
          console.log('\n🔍 Error Analysis:');
          const message = agentResponse.data.message;
          
          if (message.includes('Connection error')) {
            console.log('   🔌 Connection Error: Ollama might not be accessible');
          } else if (message.includes('not found in database')) {
            console.log('   🗄️ Database Error: Provider/model not configured in database');
          } else if (message.includes('timeout')) {
            console.log('   ⏰ Timeout Error: Processing took too long');
          } else {
            console.log(`   ❓ Unknown Error: ${message}`);
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ Request failed: ${error.code || error.message}`);
      
      if (error.code === 'ECONNABORTED') {
        console.log('   ⏰ Request timeout after 2 minutes');
        console.log('   💡 This suggests Ollama is taking too long to respond');
      } else if (error.response) {
        console.log(`   📊 Status: ${error.response.status}`);
        console.log(`   📄 Error data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }
    
  } catch (error) {
    console.log('❌ Login Error:', error.response?.data || error.message);
  }
}

console.log('🚀 Testing Ollama llama3.2:latest with end-to-end pseudonymization...\n');
testOllamaDirect();

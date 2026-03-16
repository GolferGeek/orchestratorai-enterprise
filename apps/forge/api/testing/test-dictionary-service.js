const axios = require('axios');

async function testDictionaryService() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    // Test a simple LLM call that should trigger our dictionary service
    console.log('🧪 Testing dictionary pseudonymization with direct LLM call...');
    
    const response = await axios.post('http://localhost:6100/llm/generate', {
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'Write a short paragraph about Matt Weber and GolferGeek working at Orchestrator AI.',
      options: {
        providerName: 'anthropic',  // Use external provider to trigger pseudonymization
        modelName: 'claude-3-5-haiku-20241022',
        temperature: 0.7,
        maxTokens: 150
      }
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.response) {
      console.log('✅ LLM call successful');
      console.log('�� Response:', response.data.response);
      
      // Check if original names are present (should be after reversal)
      const hasOriginals = response.data.response.includes('Matt Weber') || 
                          response.data.response.includes('GolferGeek') || 
                          response.data.response.includes('Orchestrator AI');
      
      // Check if pseudonyms are present (shouldn't be after reversal)
      const hasPseudonyms = response.data.response.includes('@person_matt') ||
                           response.data.response.includes('@user_golfer') ||
                           response.data.response.includes('@company_orchestrator');
      
      if (hasOriginals && !hasPseudonyms) {
        console.log('🎉 SUCCESS: Dictionary pseudonymization working correctly!');
      } else if (hasPseudonyms) {
        console.log('❌ ISSUE: Pseudonyms found in response - reversal not working');
      } else {
        console.log('ℹ️  NEUTRAL: LLM response doesn\'t mention the names');
      }
      
      // Check for metadata
      if (response.data.sanitizationMetadata) {
        console.log('🔍 Sanitization metadata:', JSON.stringify(response.data.sanitizationMetadata, null, 2));
      }
      
    } else {
      console.log('❌ Unexpected response format:', JSON.stringify(response.data, null, 2));
    }
    
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.statusText);
    if (error.response?.data) {
      console.log('   Error details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testDictionaryService();

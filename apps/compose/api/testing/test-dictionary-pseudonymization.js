const axios = require('axios');

async function testDictionaryPseudonymization() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    console.log('🧪 Testing dictionary pseudonymization with Anthropic (external provider)...');
    
    const response = await axios.post('http://localhost:6100/llm/generate', {
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'Write a short paragraph about Matt Weber and GolferGeek working at Orchestrator AI.',
      options: {
        providerName: 'anthropic',
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
    
    console.log('✅ ANTHROPIC SUCCESS!');
    console.log('📝 Response:');
    console.log(response.data.response);
    
    console.log('\n📊 Checking for dictionary pseudonymization:');
    const hasOriginals = response.data.response.includes('Matt Weber') || 
                         response.data.response.includes('GolferGeek') || 
                         response.data.response.includes('Orchestrator AI');
    
    const hasPseudonyms = response.data.response.includes('@person_matt') || 
                         response.data.response.includes('@user_golfer') || 
                         response.data.response.includes('@company_orchestrator');
    
    if (hasOriginals && !hasPseudonyms) {
      console.log('✅ PERFECT! Original names preserved, no pseudonym leakage');
      console.log('✅ Dictionary pseudonymization worked correctly');
    } else if (hasPseudonyms) {
      console.log('❌ ISSUE: Pseudonyms found in response - reversal may have failed');
    } else {
      console.log('⚠️  No original names found - may not have triggered pseudonymization');
    }
    
    if (response.data.metadata) {
      console.log('\n📊 Metadata:');
      console.log('  dataSanitizationApplied:', response.data.metadata.dataSanitizationApplied);
      console.log('  pseudonymsUsed:', response.data.metadata.pseudonymsUsed);
      console.log('  sanitizationTimeMs:', response.data.metadata.sanitizationTimeMs);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testDictionaryPseudonymization();

const axios = require('axios');

async function testSimpleLLM() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    console.log('🧪 Testing simple LLM call (no explicit provider)...');
    
    const response = await axios.post('http://localhost:6100/llm/generate', {
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'Say hello.',
      options: {
        temperature: 0.1,
        maxTokens: 10
      }
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Simple LLM call SUCCESS:');
    console.log(`Response: "${response.data.response}"`);
    
  } catch (error) {
    console.error('❌ Simple LLM call failed:', error.response?.data || error.message);
  }
}

testSimpleLLM();

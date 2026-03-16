const axios = require('axios');

async function testGrokSpecific() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    console.log('🧪 Testing Grok with detailed error logging...');
    
    try {
      const response = await axios.post('http://localhost:6100/llm/generate', {
        systemPrompt: 'You are a helpful assistant.',
        userPrompt: 'Say hello.',
        options: {
          providerName: 'grok',
          modelName: 'grok-3-mini',
          temperature: 0.1,
          maxTokens: 10
        }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      
      console.log('✅ GROK SUCCESS:');
      console.log(`Response: "${response.data.response}"`);
      
    } catch (error) {
      console.log('❌ GROK DETAILED ERROR:');
      console.log('Status:', error.response?.status);
      console.log('Data:', JSON.stringify(error.response?.data, null, 2));
      
      if (error.code === 'ECONNABORTED') {
        console.log('Error: Request timeout');
      } else if (error.message) {
        console.log('Error Message:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
  }
}

testGrokSpecific();

const axios = require('axios');

async function testDebugError() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    console.log('🧪 Testing OpenAI with detailed error logging...');
    
    try {
      const response = await axios.post('http://localhost:6100/llm/generate', {
        systemPrompt: 'You are a helpful assistant.',
        userPrompt: 'Say hello.',
        options: {
          providerName: 'openai',
          modelName: 'gpt-3.5-turbo',
          temperature: 0.1,
          maxTokens: 10
        }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ OpenAI SUCCESS:', response.data);
      
    } catch (error) {
      console.log('❌ OpenAI DETAILED ERROR:');
      console.log('Status:', error.response?.status);
      console.log('Headers:', error.response?.headers);
      console.log('Data:', JSON.stringify(error.response?.data, null, 2));
      
      if (error.response?.data?.message) {
        console.log('Error Message:', error.response.data.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
  }
}

testDebugError();

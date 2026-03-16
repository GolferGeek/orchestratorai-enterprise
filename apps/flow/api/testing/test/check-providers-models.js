const axios = require('axios');

async function checkProvidersModels() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    console.log('📊 Checking available providers...');
    try {
      const providersResponse = await axios.get('http://localhost:6100/llm/providers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('✅ Available Providers:');
      providersResponse.data.forEach(provider => {
        console.log(`  - ${provider.name} (${provider.id})`);
      });
    } catch (error) {
      console.log('❌ Failed to get providers:', error.response?.data || error.message);
    }
    
    console.log('\n📊 Checking available models...');
    try {
      const modelsResponse = await axios.get('http://localhost:6100/llm/models', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('✅ Available Models:');
      modelsResponse.data.forEach(model => {
        console.log(`  - ${model.name} (Provider: ${model.provider?.name || 'Unknown'})`);
      });
    } catch (error) {
      console.log('❌ Failed to get models:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
  }
}

checkProvidersModels();

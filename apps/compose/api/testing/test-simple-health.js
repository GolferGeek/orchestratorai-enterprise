const axios = require('axios');

const API_BASE = 'http://localhost:3001';

async function testHealth() {
  try {
    console.log('🔐 Testing login...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    console.log('✅ Login successful');
    console.log('Token length:', loginResponse.data.access_token?.length || 'No token');
    
  } catch (error) {
    console.log('❌ Login failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }
}

testHealth();

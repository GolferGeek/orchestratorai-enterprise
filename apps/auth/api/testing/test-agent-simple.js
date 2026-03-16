const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function testAgentSimple() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    console.log('🧪 Testing agent with automatic routing (no provider specified)...');
    
    const response = await axios.post('http://localhost:6100/agents/marketing/blog_post/tasks', {
      method: 'process',
      prompt: 'Write a short paragraph about Matt Weber and GolferGeek working at Orchestrator AI.',
      conversationId: uuidv4(),
      conversationHistory: [],
      // Let the routing service decide provider/model automatically
      executionMode: 'immediate',
      taskId: uuidv4()
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Agent call successful');
    console.log('📊 Status:', response.data.status);
    
    if (response.data.result && response.data.result.success) {
      console.log('🎉 SUCCESS: Agent processed successfully!');
      console.log('📝 Response:', response.data.result.response);
      
      // Check for pseudonym handling
      const responseText = response.data.result.response;
      const hasOriginals = responseText.includes('Matt Weber') || 
                          responseText.includes('GolferGeek') || 
                          responseText.includes('Orchestrator AI');
      
      if (hasOriginals) {
        console.log('✅ Original names present - dictionary pseudonymization working correctly!');
      } else {
        console.log('ℹ️  Names not mentioned in response');
      }
      
    } else if (response.data.result && response.data.result.error) {
      console.log('❌ Agent error:', response.data.result.error);
    } else {
      console.log('❓ Unexpected response format');
    }
    
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.statusText);
    if (error.response?.data) {
      console.log('   Error details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testAgentSimple();

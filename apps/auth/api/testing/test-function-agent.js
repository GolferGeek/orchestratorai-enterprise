#!/usr/bin/env node

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE = 'http://localhost:6100';
const TEST_USER = 'demo.user@orchestratorai.io';
const TEST_PASSWORD = 'DemoUser123!';

async function test() {
  try {
    // Login
    console.log('🔐 Logging in...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: TEST_USER,
      password: TEST_PASSWORD
    });
    const token = loginRes.data.accessToken;
    console.log('✅ Logged in\n');

    // Test the function agent with my-org namespace
    // According to Agent2AgentController, the pattern is:
    // /agents/:orgSlug/:agentSlug/tasks
    
    const testUrls = [
      '/agents/my-org/blog_post_writer/tasks',
      '/agent-to-agent/my-org/blog_post_writer/tasks',
    ];

    const taskPayload = {
      method: 'converse',
      prompt: 'Write a short blog post about playing golf',
      conversationId: uuidv4(),
      taskId: uuidv4(),
      params: {
        mode: 'converse',
        quick: true,
        noDeliverable: true
      },
      timeoutSeconds: 60
    };

    console.log('📦 Payload:', JSON.stringify(taskPayload, null, 2));
    console.log('\n');

    for (const url of testUrls) {
      try {
        console.log(`🧪 Testing: POST ${url}\n`);
        
        const response = await axios.post(
          `${API_BASE}${url}`,
          taskPayload,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 65000
          }
        );

        console.log('✅ SUCCESS!');
        console.log('📥 Response:', JSON.stringify(response.data, null, 2));
        console.log('\n🎉 Working URL found:', url);
        return;
        
      } catch (error) {
        console.error(`❌ Failed for ${url}`);
        console.error('   Status:', error.response?.status);
        console.error('   Error:', error.response?.data?.message || error.message);
        console.log('');
      }
    }

    console.log('❌ All URLs failed!');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

test();


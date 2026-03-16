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

    // Test the blog_post agent (demo context agent)
    console.log('🧪 Testing: POST /agents/marketing/blog_post/tasks\n');
    
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

    const response = await axios.post(
      `${API_BASE}/agents/marketing/blog_post/tasks`,
      taskPayload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 65000 // 65 seconds
      }
    );

    console.log('✅ SUCCESS!');
    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
    
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


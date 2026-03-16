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

    // Test context agent with org namespace
    // Agent: blog_post_writer (type: context, namespace: my-org)
    // Expected URL: /agents/my-org/blog_post_writer/tasks
    
    console.log('🧪 Testing: POST /agents/my-org/blog_post_writer/tasks\n');
    console.log('Agent type: context');
    console.log('Namespace: my-org');
    console.log('Agent name: blog_post_writer\n');

    const taskPayload = {
      method: 'converse',
      prompt: 'Write a short blog post about playing golf in the rain',
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
      `${API_BASE}/agents/my-org/blog_post_writer/tasks`,
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
    console.log('📥 Task ID:', response.data.taskId);
    console.log('📥 Status:', response.data.status);
    if (response.data.result?.response) {
      console.log('\n📝 Response preview:');
      console.log(response.data.result.response.substring(0, 200) + '...');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Full error:', error);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

test();


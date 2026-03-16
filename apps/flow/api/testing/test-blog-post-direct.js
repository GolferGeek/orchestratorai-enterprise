#!/usr/bin/env node

/**
 * Direct Test: Frontend -> Blog Post Agent
 * Tests the exact flow from frontend to backend
 */

const axios = require('axios');

const API_BASE = 'http://localhost:6100';

// Test credentials (from working tests)
const TEST_USER = 'demo.user@orchestratorai.io';
const TEST_PASSWORD = 'DemoUser123!';

let authToken = null;

// Get auth token
async function getAuthToken() {
  console.log('🔐 Authenticating...');
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: TEST_USER,
      password: TEST_PASSWORD
    });
    authToken = response.data.accessToken || response.data.access_token;
    console.log('✅ Authenticated successfully\n');
    return authToken;
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    throw error;
  }
}

// Simulate frontend's exact request
async function testBlogPostDirect() {
  console.log('🧪 Testing Blog Post Agent - Direct Frontend Flow\n');

  // Get auth token first
  await getAuthToken();

  // Frontend agent info (what the UI shows)
  // The NEW function agent with my-org namespace (from registry):
  const agent = {
    name: 'blog_post_writer',
    type: 'function',
    namespace: 'my-org'
  };

  // Test URL constructions - NEW function agent vs OLD demo context agent
  const urlVariations = [
    // NEW: Function agent with org namespace
    `/agents/my-org/blog_post_writer/tasks`,
    `/agents/function/blog_post_writer/tasks`,
    
    // OLD: Demo context agents (for comparison)
    `/agents/marketing/blog_post/tasks`,
    `/agents/demo/marketing/blog_post/tasks`,
  ];

  const taskPayload = {
    method: 'converse',
    prompt: 'Write a blog post about playing golf in the rain',
    conversationId: 'test-conv-123',
    taskId: 'test-task-456',
    params: {
      mode: 'converse',
      quick: true,
      noDeliverable: true
    },
    timeoutSeconds: 60
  };

  console.log('📦 Task Payload:');
  console.log(JSON.stringify(taskPayload, null, 2));
  console.log('\n🔍 Testing URL variations...\n');

  for (const url of urlVariations) {
    try {
      console.log(`\n➡️  Testing: ${url}`);
      const response = await axios.post(`${API_BASE}${url}`, taskPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 5000
      });

      console.log(`✅ SUCCESS! Status: ${response.status}`);
      console.log('📥 Response:', JSON.stringify(response.data, null, 2));
      console.log('\n🎉 Found working URL!');
      return;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log(`⏱️  TIMEOUT (5s) - Backend is processing`);
      } else if (error.response) {
        console.log(`❌ ${error.response.status} ${error.response.statusText}`);
        if (error.response.status === 404) {
          console.log('   → Route not found');
        } else if (error.response.status === 500) {
          console.log('   → Server error:', error.response.data?.message || 'Unknown');
        }
      } else if (error.request) {
        console.log(`❌ No response from server`);
      } else {
        console.log(`❌ Request error:`, error.message);
      }
    }
  }

  console.log('\n\n❌ All URL variations failed!');
  console.log('\n🔍 Checking available routes...');
  await checkAvailableRoutes();
}

// Check what routes are actually available
async function checkAvailableRoutes() {
  try {
    console.log('\n📋 Fetching available agents...');
    const response = await axios.get(`${API_BASE}/agents`);
    
    const agents = response.data.agents || response.data;
    console.log(`\n✅ Found ${agents.length} agents:\n`);
    agents.forEach(agent => {
      console.log(`  • ${agent.name} (type: ${agent.type})`);
      console.log(`    namespace: ${agent.namespace || 'none'}`);
      console.log(`    path: ${agent.relativePath || agent.path || 'unknown'}`);
      console.log(`    URL: /agents/${agent.relativePath || agent.path}/tasks\n`);
    });

    // Find blog_post_writer specifically
    const blogPostAgent = agents.find(a => 
      a.name === 'blog_post_writer' || 
      a.name === 'blog_post' ||
      a.relativePath?.includes('blog')
    );

    if (blogPostAgent) {
      console.log('🎯 Found blog post agent!');
      console.log(JSON.stringify(blogPostAgent, null, 2));
      
      const correctUrl = `/agents/${blogPostAgent.relativePath || blogPostAgent.path}/tasks`;
      console.log(`\n✅ Correct URL should be: ${correctUrl}`);
      
      // Test the correct URL
      console.log('\n🧪 Testing correct URL...');
      await testCorrectUrl(correctUrl);
    } else {
      console.log('\n❌ Blog post agent not found in registry!');
    }

  } catch (error) {
    console.log('❌ Failed to fetch available agents:', error.message);
  }
}

async function testCorrectUrl(url) {
  const taskPayload = {
    method: 'converse',
    prompt: 'Write a blog post about playing golf in the rain',
    conversationId: 'test-conv-123',
    taskId: 'test-task-456',
    params: {
      mode: 'converse',
      quick: true,
      noDeliverable: true
    },
    timeoutSeconds: 60
  };

  try {
    console.log(`➡️  POST ${API_BASE}${url}`);
    const response = await axios.post(`${API_BASE}${url}`, taskPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      timeout: 10000
    });

    console.log(`✅ SUCCESS! Status: ${response.status}`);
    console.log('📥 Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      console.log(`❌ ${error.response.status} ${error.response.statusText}`);
      console.log('📥 Error response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`❌ Error:`, error.message);
    }
  }
}

// Run the test
testBlogPostDirect().catch(console.error);


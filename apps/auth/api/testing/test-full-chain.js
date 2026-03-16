#!/usr/bin/env node
const { randomUUID } = require('crypto');

const API_BASE_URL = 'http://localhost:6100';
const TEST_USER = 'demo.user@orchestratorai.io';
const TEST_PASSWORD = 'DemoUser123!';

async function login() {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER, password: TEST_PASSWORD }),
  });
  const data = await response.json();
  return data.accessToken;
}

async function test() {
  const token = await login();

  const response = await fetch(`${API_BASE_URL}/agent-to-agent/demo/supabase-agent/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: 'build',
      conversationId: randomUUID(),
      metadata: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      },
      payload: {
        userMessage: 'How many users are in our system?',
      },
    }),
  });

  const result = await response.json();

  // Parse the deliverable content
  const content = JSON.parse(result.payload.content.deliverable.currentVersion.content);

  console.log('Tool Results:');
  content.forEach((toolResult, i) => {
    console.log(`\n${i + 1}. ${toolResult.tool}`);
    console.log(`   Success: ${toolResult.success}`);
    if (toolResult.success) {
      console.log(`   Result: ${JSON.stringify(toolResult.result).substring(0, 200)}...`);
    } else {
      console.log(`   Error: ${toolResult.error}`);
    }
  });
}

test().catch(console.error);

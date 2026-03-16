#!/usr/bin/env node
/**
 * Test metadata provider/model auto-injection for Supabase Tool Agent
 * Verifies that provider/model from request metadata is automatically
 * injected into generate-sql tool parameters
 */

const { randomUUID } = require('crypto');
const { getApiUrl } = require('./test-env');

const API_BASE_URL = getApiUrl();
const TEST_USER = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';

console.log('🧪 Testing Metadata Auto-Injection');
console.log('===================================\n');

async function login() {
  console.log('🔐 Authenticating...');
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_USER,
      password: TEST_PASSWORD,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Login failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  console.log('✅ Authenticated\n');
  return data.accessToken;
}

async function testMetadataInjection(accessToken) {
  console.log('🔧 Testing with metadata provider/model...');

  const payload = {
    mode: 'build',
    conversationId: randomUUID(),
    metadata: {
      // These should be auto-injected into generate-sql tool
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    },
    payload: {
      userMessage: 'How many users are in our system?',
      // NOT specifying toolParams - should use metadata instead
    },
  };

  console.log('📤 Request metadata:', JSON.stringify(payload.metadata, null, 2));

  const response = await fetch(
    `${API_BASE_URL}/agent-to-agent/demo/supabase-agent/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Request failed (${response.status}): ${error}`);
  }

  const result = await response.json();
  console.log('✅ Tool agent executed\n');

  return result;
}

async function main() {
  try {
    const accessToken = await login();
    const result = await testMetadataInjection(accessToken);

    console.log('📊 Result Summary:');
    console.log('   Success:', result.success);
    console.log('   Mode:', result.mode);

    if (result.payload?.metadata) {
      console.log('\n📋 Metadata:');
      console.log('   Tools Executed:', result.payload.metadata.toolsExecuted);
      console.log('   Successful:', result.payload.metadata.successfulTools);
      console.log('   Failed:', result.payload.metadata.failedTools);
      console.log('   Tools Used:', result.payload.metadata.toolsUsed?.join(', '));
    }

    // Check if generate-sql succeeded (it should with metadata injection)
    const generateSqlSuccess = result.success &&
      result.payload?.metadata?.successfulTools >= 2; // get-schema + generate-sql

    if (generateSqlSuccess) {
      console.log('\n✅ TEST PASSED!');
      console.log('   Metadata provider/model was auto-injected successfully');
      console.log('   generate-sql tool executed without LLM config errors');
      process.exit(0);
    } else {
      console.log('\n❌ TEST FAILED!');
      console.log('   generate-sql tool likely failed due to missing LLM config');
      console.log('\nFull response:', JSON.stringify(result, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

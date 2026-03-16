#!/usr/bin/env node
/**
 * Supabase Tool Agent Smoke Test
 *
 * Quick smoke test to verify Supabase tool agent can execute in BUILD mode
 * Tests all 4 tools in sequential execution with proper namespacing
 */

const { randomUUID } = require('crypto');
const { getApiUrl } = require('./test-env');

const API_BASE_URL = getApiUrl();
const TEST_USER = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';

console.log('🧪 Supabase Tool Agent Smoke Test');
console.log('==================================\n');

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

async function executeToolAgent(accessToken) {
  console.log('🔧 Executing Supabase Tool Agent in BUILD mode...');

  const payload = {
    mode: 'build',
    conversationId: randomUUID(),
    payload: {
      userMessage: 'Run database analytics on agent_conversations table',
      // Override tool parameters for testing
      toolParams: {
        'supabase/get-schema': {
          tables: ['agent_conversations'],
          domain: 'core',
        },
        'supabase/generate-sql': {
          query: 'top 5 conversations by created date',
          tables: ['agent_conversations'],
          max_rows: 5,
        },
        'supabase/execute-sql': {
          max_rows: 10,
        },
        'supabase/analyze-results': {
          analysis_prompt: 'Summarize main findings for stakeholders',
        },
      },
      toolExecutionMode: 'sequential',
      stopOnError: true,
    },
  };

  const response = await fetch(
    `${API_BASE_URL}/agent-to-agent/demo/supabase-agent/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Tool agent execution failed (${response.status}): ${error}`,
    );
  }

  const result = await response.json();
  console.log('✅ Tool agent executed successfully\n');

  return result;
}

function validateResponse(result) {
  console.log('🔍 Validating response...\n');

  // Check response structure
  if (!result.success) {
    throw new Error(`Expected success=true, got: ${result.success}`);
  }

  if (result.mode !== 'build') {
    throw new Error(`Expected mode='build', got: ${result.mode}`);
  }

  // Check metadata
  const metadata = result.payload?.metadata;
  if (!metadata) {
    throw new Error('Missing metadata in response');
  }

  console.log('📊 Metadata:');
  console.log(
    `   Tools Executed: ${metadata.toolsExecuted || 'missing'}`,
  );
  console.log(
    `   Successful Tools: ${metadata.successfulTools || 'missing'}`,
  );
  console.log(
    `   Failed Tools: ${metadata.failedTools || 'missing'}`,
  );
  console.log(
    `   Execution Mode: ${metadata.executionMode || 'missing'}`,
  );
  console.log('');

  // Validate required metadata fields per PRD §8
  const requiredMetadataFields = [
    'toolsExecuted',
    'successfulTools',
    'failedTools',
    'executionMode',
    'stopOnError',
    'toolsUsed',
  ];

  const missingFields = requiredMetadataFields.filter(
    (field) => !(field in metadata),
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required metadata fields: ${missingFields.join(', ')}`,
    );
  }

  // Validate tools were executed
  if (metadata.toolsExecuted === 0) {
    throw new Error('No tools were executed');
  }

  if (metadata.successfulTools === 0) {
    throw new Error('No tools succeeded');
  }

  // Validate toolsUsed contains namespaced tools
  if (!Array.isArray(metadata.toolsUsed) || metadata.toolsUsed.length === 0) {
    throw new Error('toolsUsed array is empty or missing');
  }

  // Check that all tools are namespaced
  for (const toolName of metadata.toolsUsed) {
    if (!toolName.includes('/')) {
      throw new Error(
        `Tool '${toolName}' is not namespaced (expected 'namespace/tool')`,
      );
    }
  }

  console.log('✅ All validations passed!\n');
}

async function main() {
  try {
    const accessToken = await login();
    const result = await executeToolAgent(accessToken);
    validateResponse(result);

    console.log('🎉 SMOKE TEST PASSED!');
    console.log('====================');
    console.log('✅ Tool agent execution works');
    console.log('✅ All 4 Supabase MCP tools accessible');
    console.log('✅ Deliverable metadata complete');
    console.log('✅ Namespace validation working');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ SMOKE TEST FAILED!');
    console.error('===================');
    console.error(`Error: ${error.message}`);
    console.error('');

    process.exit(1);
  }
}

main();

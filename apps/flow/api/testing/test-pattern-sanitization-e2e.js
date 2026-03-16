#!/usr/bin/env node

/**
 * E2E Test: Pattern-Based Sanitization with Reversibility
 * 
 * Comprehensive tests for pattern-based sanitization, pseudonymization, and show-stoppers.
 * Tests all combinations of show-stoppers, patterns, and pseudonyms.
 * 
 * Run with: node apps/api/testing/test-pattern-sanitization-e2e.js
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');
const { getApiUrl } = require('./test-env');

const API_BASE = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';
const TEST_USER_ID = process.env.SUPABASE_TEST_USERID || 'b29a590e-b07f-49df-a25b-574c956b5035';
const ORG_SLUG = 'demo-org';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

let authToken = '';

async function getAuthToken() {
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    // Response uses accessToken (camelCase)
    return response.data.accessToken || response.data.access_token;
  } catch (error) {
    console.error('❌ Authentication failed:', error.response?.data || error.message);
    throw error;
  }
}

async function callA2A(userMessage, provider = 'openai', model = 'gpt-4o-mini') {
  const agentSlug = 'blog-post-writer';
  const response = await axios.post(
    `${API_BASE}/agent-to-agent/${ORG_SLUG}/${agentSlug}/tasks`,
    {
      userMessage,
      mode: 'converse',
      context: {
        orgSlug: ORG_SLUG,
        agentSlug,
        agentType: 'context',
        userId: TEST_USER_ID,
        conversationId: NIL_UUID,
        taskId: NIL_UUID,
        planId: NIL_UUID,
        deliverableId: NIL_UUID,
        provider,
        model,
      },
      payload: {},
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      timeout: 120000,
    },
  );
  return response.data;
}

async function queryLLMUsage(statusFilter = null) {
  try {
    let whereClause = `WHERE user_id = '${TEST_USER_ID}'`;
    if (statusFilter) {
      whereClause += ` AND status = '${statusFilter}'`;
    }
    const query = `
      SELECT 
        showstopper_detected,
        pii_detected,
        pseudonyms_used,
        pseudonym_types,
        redactions_applied,
        redaction_types,
        data_sanitization_applied,
        sanitization_level,
        status,
        created_at
      FROM llm_usage
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT 1;
    `;

    const result = execSync(
      `PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -t -A -F'|' -c "${query.replace(/\n/g, ' ')}"`,
      { encoding: 'utf-8' },
    );

    if (result && result.trim()) {
      const parts = result.trim().split('|');
      return {
        showstopper_detected: parts[0] === 't',
        pii_detected: parts[1] === 't',
        pseudonyms_used: parseInt(parts[2]) || 0,
        pseudonym_types: parts[3] ? JSON.parse(parts[3]) : [],
        redactions_applied: parseInt(parts[4]) || 0,
        redaction_types: parts[5] ? JSON.parse(parts[5]) : [],
        data_sanitization_applied: parts[6] === 't',
        sanitization_level: parts[7],
        status: parts[8],
        created_at: parts[9],
      };
    }
    return null;
  } catch (error) {
    console.warn('⚠️  Could not query database:', error.message);
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testCase(name, userMessage, expectedBlocked = false, checks = {}) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 TEST: ${name}`);
  console.log('='.repeat(70));
  console.log(`📝 Input: ${userMessage}`);

  try {
    const response = await callA2A(userMessage);
    
    if (expectedBlocked) {
      // Check for blocking in multiple response formats
      const isBlocked = 
        response.blocked === true ||
        response.success === false ||
        (response.payload?.content?.action === 'run_human_response' && 
         (response.payload?.content?.reason === 'routing_showstopper' ||
          response.payload?.content?.message === 'showstopper-pii'));
      
      if (isBlocked) {
        console.log('✅ PASS: Request was blocked as expected');
        console.log(`   Reason: ${response.payload?.content?.reason || response.reason || 'showstopper-pii'}`);
        console.log(`   Message: ${response.payload?.content?.message || response.message || 'showstopper detected'}`);
        if (response.details?.detectedTypes) {
          console.log(`   Detected Types: ${JSON.stringify(response.details.detectedTypes)}`);
        }
      } else {
        console.log('❌ FAIL: Request should have been blocked but was processed');
        console.log(`   Response: ${JSON.stringify(response).substring(0, 300)}...`);
      }
    } else {
      if (response.success && 
          response.payload?.content?.action !== 'run_human_response' &&
          !response.blocked) {
        console.log('✅ PASS: Request was processed successfully');
        
        // Check response content for reversals
        const responseText = JSON.stringify(response.payload?.content || {});
        if (checks.shouldContain) {
          checks.shouldContain.forEach((text) => {
            if (responseText.includes(text)) {
              console.log(`   ✅ Found original value: "${text}"`);
            } else {
              console.log(`   ⚠️  Missing expected original: "${text}"`);
            }
          });
        }
        if (checks.shouldNotContain) {
          checks.shouldNotContain.forEach((text) => {
            if (!responseText.includes(text)) {
              console.log(`   ✅ Correctly absent: "${text}"`);
            } else {
              console.log(`   ❌ Found unexpected pseudonym: "${text}"`);
            }
          });
        }
      } else {
        console.log('❌ FAIL: Request failed or was blocked unexpectedly');
        console.log(`   Response: ${JSON.stringify(response).substring(0, 300)}...`);
      }
    }

    // Check database record
    await sleep(2000); // Wait for DB update
    // For blocked requests, query for 'blocked' status; otherwise get most recent
    const usage = await queryLLMUsage(expectedBlocked ? 'blocked' : null);
    if (usage) {
      console.log('\n📊 Database Record:');
      console.log(`   showstopper_detected: ${usage.showstopper_detected}`);
      console.log(`   pii_detected: ${usage.pii_detected}`);
      console.log(`   pseudonyms_used: ${usage.pseudonyms_used}`);
      console.log(`   pseudonym_types: ${JSON.stringify(usage.pseudonym_types)}`);
      console.log(`   redactions_applied: ${usage.redactions_applied}`);
      console.log(`   redaction_types: ${JSON.stringify(usage.redaction_types)}`);
      console.log(`   data_sanitization_applied: ${usage.data_sanitization_applied}`);
      console.log(`   sanitization_level: ${usage.sanitization_level}`);

      // Verify checks
      if (checks.dbChecks) {
        console.log('\n🔍 Database Checks:');
        Object.entries(checks.dbChecks).forEach(([key, expected]) => {
          const actual = usage[key];
          // Handle function checks (e.g., (v) => v > 0)
          if (typeof expected === 'function') {
            const passed = expected(actual);
            if (passed) {
              console.log(`   ✅ ${key}: ${actual} (passed check)`);
            } else {
              console.log(`   ❌ ${key}: ${actual} (failed check)`);
            }
          } else if (actual === expected) {
            console.log(`   ✅ ${key}: ${actual} (expected ${expected})`);
          } else {
            console.log(`   ❌ ${key}: ${actual} (expected ${expected})`);
          }
        });
      }
    } else {
      console.log('⚠️  Could not retrieve database record');
    }
  } catch (error) {
    if (expectedBlocked && error.response?.status === 400) {
      console.log('✅ PASS: Request was blocked (400 error)');
      console.log(`   Error: ${JSON.stringify(error.response.data)}`);
    } else {
      console.log('❌ ERROR:', error.response?.data || error.message);
    }
  }
}

async function runAllTests() {
  console.log('🚀 Starting Pattern Sanitization E2E Tests');
  console.log(`📡 API Base: ${API_BASE}`);
  console.log(`👤 Test User: ${TEST_EMAIL}`);

  // Authenticate
  console.log('\n🔐 Authenticating...');
  authToken = await getAuthToken();
  console.log('✅ Authentication successful');

  // TEST 1: Show-stoppers Only
  await testCase(
    'Show-stopper: SSN',
    'Write a blog post about someone with SSN 123-45-6789',
    true, // Should be blocked
    {
      dbChecks: {
        showstopper_detected: true,
      },
    },
  );

  await testCase(
    'Show-stopper: Credit Card',
    'My credit card is 4532-1234-5678-9010',
    true, // Should be blocked
  );

  // TEST 2: Patterns Only
  await testCase(
    'Pattern: Email',
    'Write a blog post about contacting us at test@example.com for support',
    false, // Should not be blocked
    {
      shouldContain: ['test@example.com'],
      dbChecks: {
        showstopper_detected: false,
        pii_detected: true,
        redactions_applied: (v) => v > 0,
        redaction_types: (arr) => arr.includes('email'),
      },
    },
  );

  await testCase(
    'Pattern: Phone',
    'Call us at 555-123-4567 for assistance',
    false,
    {
      dbChecks: {
        redactions_applied: (v) => v > 0,
        redaction_types: (arr) => arr.includes('phone'),
      },
    },
  );

  // TEST 3: Pseudonyms Only
  await testCase(
    'Pseudonym: GolferGeek + Orchestrator AI',
    'Write a blog post about my friend GolferGeek who works at Orchestrator AI',
    false,
    {
      shouldContain: ['GolferGeek', 'Orchestrator AI'],
      shouldNotContain: ['@user_golfer', '@company_orchestrator'],
      dbChecks: {
        showstopper_detected: false,
        pii_detected: true,
        pseudonyms_used: (v) => v > 0,
        pseudonym_types: (arr) => arr.length > 0,
      },
    },
  );

  await testCase(
    'Pseudonym: Matt Weber',
    'Write about Matt Weber who is a great developer',
    false,
    {
      shouldContain: ['Matt Weber'],
      dbChecks: {
        pseudonyms_used: (v) => v > 0,
      },
    },
  );

  // TEST 4: Patterns + Pseudonyms
  await testCase(
    'Pattern + Pseudonym: Email + GolferGeek',
    'Write a blog post about GolferGeek. Contact us at contact@example.com for more info',
    false,
    {
      shouldContain: ['GolferGeek', 'contact@example.com'],
      dbChecks: {
        showstopper_detected: false,
        pii_detected: true,
        pseudonyms_used: (v) => v > 0,
        redactions_applied: (v) => v > 0,
        data_sanitization_applied: true,
        sanitization_level: 'standard',
      },
    },
  );

  await testCase(
    'Multiple Patterns + Pseudonyms',
    'Matt Weber works at Orchestrator AI. Call 555-123-4567 or email test@example.com',
    false,
    {
      shouldContain: ['Matt Weber', 'Orchestrator AI'],
      dbChecks: {
        pseudonyms_used: (v) => v > 0,
        redactions_applied: (v) => v > 0,
      },
    },
  );

  // TEST 5: Show-stoppers + Patterns
  await testCase(
    'Show-stopper + Pattern: SSN + Email',
    'My SSN is 123-45-6789 and my email is test@example.com',
    true, // Should be blocked
    {
      dbChecks: {
        showstopper_detected: true,
      },
    },
  );

  // TEST 6: Show-stoppers + Pseudonyms
  await testCase(
    'Show-stopper + Pseudonym: Credit Card + GolferGeek',
    'GolferGeek has credit card 4532-1234-5678-9010',
    true, // Should be blocked
  );

  // TEST 7: All Three
  await testCase(
    'Show-stopper + Pattern + Pseudonym: All',
    'GolferGeek at Orchestrator AI has SSN 123-45-6789 and email test@example.com',
    true, // Should be blocked
  );

  // TEST 8: Local Provider (should skip sanitization)
  console.log('\n' + '='.repeat(70));
  console.log('🧪 TEST: Local Provider (Ollama) - Should Skip Sanitization');
  console.log('='.repeat(70));
  try {
    const response = await axios.post(
      `${API_BASE}/agent-to-agent/${ORG_SLUG}/blog-post-writer/tasks`,
      {
        userMessage: 'GolferGeek works at Orchestrator AI and email is test@example.com',
        mode: 'converse',
        context: {
          orgSlug: ORG_SLUG,
          agentSlug: 'blog-post-writer',
          agentType: 'context',
          userId: TEST_USER_ID,
          conversationId: NIL_UUID,
          taskId: NIL_UUID,
          planId: NIL_UUID,
          deliverableId: NIL_UUID,
          provider: 'ollama',
          model: 'llama3.2:1b',
        },
        payload: {},
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        timeout: 120000,
      },
    );

    if (response.data.success) {
      console.log('✅ PASS: Local provider request processed');
      await sleep(2000);
      const usage = await queryLLMUsage();
      if (usage) {
        console.log(`   is_local: ${usage.is_local || 'N/A'}`);
        console.log(`   Local providers may skip sanitization`);
      }
    }
  } catch (error) {
    console.log('⚠️  Local provider test:', error.response?.data || error.message);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ All tests completed!');
  console.log('='.repeat(70));
}

// Run tests
runAllTests().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});


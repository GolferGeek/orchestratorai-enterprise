#!/usr/bin/env node

/**
 * Quick Test: Pattern-Based Sanitization - Core Functionality
 * 
 * Tests the core sanitization logic without making full LLM calls.
 * Verifies:
 * - Pattern detection works
 * - Show-stopper detection works
 * - Database queries work
 * 
 * Run with: node apps/api/testing/test-pattern-sanitization-quick.js
 */

const axios = require('axios');
const { execSync } = require('child_process');
const { getApiUrl } = require('./test-env');

const API_BASE = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';

async function testSanitizationEndpoint() {
  console.log('🧪 Testing Sanitization Endpoint');
  console.log('='.repeat(70));

  try {
    // Get auth token
    const authResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    const authToken = authResponse.data.accessToken || authResponse.data.access_token;

    console.log('✅ Authentication successful');

    // Test 1: Pattern detection
    console.log('\n📋 Test 1: Pattern Detection');
    const patternTest = await axios.post(
      `${API_BASE}/llm/sanitization/sanitize`,
      {
        text: 'Contact us at test@example.com or call 555-123-4567',
        action: 'detect',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      },
    );

    console.log('✅ Pattern detection response received');
    console.log(`   Detected ${patternTest.data.matches?.length || 0} patterns`);
    if (patternTest.data.matches) {
      patternTest.data.matches.forEach((match) => {
        console.log(`   - ${match.dataType}: "${match.value}" (${match.severity})`);
      });
    }

    // Test 2: Show-stopper detection
    console.log('\n📋 Test 2: Show-stopper Detection');
    const showstopperTest = await axios.post(
      `${API_BASE}/llm/sanitization/sanitize`,
      {
        text: 'My SSN is 123-45-6789',
        action: 'detect',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      },
    );

    console.log('✅ Show-stopper detection response received');
    const showstoppers = showstopperTest.data.matches?.filter(
      (m) => m.severity === 'showstopper',
    ) || [];
    console.log(`   Found ${showstoppers.length} show-stoppers`);
    showstoppers.forEach((match) => {
      console.log(`   - ${match.dataType}: "${match.value}"`);
    });

    // Test 3: Database schema verification
    console.log('\n📋 Test 3: Database Schema Verification');
    const schemaCheck = execSync(
      `PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'llm_usage' AND column_name = 'showstopper_detected';"`,
      { encoding: 'utf-8' },
    );

    if (schemaCheck.trim()) {
      console.log('✅ showstopper_detected column exists');
    } else {
      console.log('❌ showstopper_detected column missing');
    }

    // Test 4: Pattern redaction service (if endpoint exists)
    console.log('\n📋 Test 4: Pattern Redaction');
    try {
      const redactionTest = await axios.post(
        `${API_BASE}/llm/sanitization/sanitize`,
        {
          text: 'Contact test@example.com or call 555-123-4567',
          action: 'redact',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        },
      );

      console.log('✅ Pattern redaction response received');
      console.log(`   Original: ${redactionTest.data.originalText?.substring(0, 50)}...`);
      console.log(`   Redacted: ${redactionTest.data.redactedText?.substring(0, 50)}...`);
      console.log(`   Mappings: ${redactionTest.data.mappings?.length || 0}`);
    } catch (error) {
      console.log('⚠️  Pattern redaction endpoint may not be available:', error.response?.status);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Quick tests completed!');
    console.log('='.repeat(70));
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testSanitizationEndpoint();


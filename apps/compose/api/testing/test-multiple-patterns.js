#!/usr/bin/env node

/**
 * Test: Multiple Patterns of Same Type
 * 
 * Tests how the system handles multiple instances of the same pattern type
 * (e.g., three email addresses in the same text)
 */

const axios = require('axios');
const { getApiUrl } = require('./test-env');

const API_BASE = getApiUrl();
const TEST_EMAIL = process.env.SUPABASE_TEST_USER || 'demo.user@orchestratorai.io';
const TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD || 'DemoUser123!';

async function testMultiplePatterns() {
  console.log('🧪 Testing Multiple Patterns of Same Type');
  console.log('='.repeat(70));

  try {
    // Authenticate
    const authResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    const authToken = authResponse.data.accessToken || authResponse.data.access_token;
    console.log('✅ Authenticated\n');

    // Test with three different email addresses
    const testText = `
      Contact Alice at alice@example.com for sales inquiries.
      For support, email bob@support.example.com.
      Technical questions go to charlie@tech.example.com.
    `;

    console.log('📝 Test Input:');
    console.log(testText);
    console.log('\n🔍 Expected Behavior:');
    console.log('  - All three emails should be detected');
    console.log('  - All three should be redacted to [EMAIL_REDACTED]');
    console.log('  - Each should have its own mapping stored');
    console.log('  - On reversal, each [EMAIL_REDACTED] should restore to its original email\n');

    // Test the sanitization endpoint
    const response = await axios.post(
      `${API_BASE}/llm/sanitization/sanitize`,
      {
        text: testText,
        enableRedaction: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      },
    );

    console.log('📊 Detection Results:');
    console.log(`   Total matches: ${response.data.matches?.length || 0}`);
    if (response.data.matches) {
      response.data.matches.forEach((match, idx) => {
        console.log(`   ${idx + 1}. "${match.value}" (${match.dataType}) at position ${match.startIndex}-${match.endIndex}`);
      });
    }

    console.log('\n📊 Redaction Results:');
    console.log(`   Original: ${testText.substring(0, 100)}...`);
    console.log(`   Redacted: ${response.data.sanitizedText?.substring(0, 100)}...`);
    console.log(`   Mappings stored: ${response.data.mappings?.length || 0}`);

    if (response.data.mappings) {
      console.log('\n📋 Mappings:');
      response.data.mappings.forEach((mapping, idx) => {
        console.log(`   ${idx + 1}. "${mapping.original}" → "${mapping.redacted}"`);
      });
    }

    // Test reversal
    if (response.data.mappings && response.data.sanitizedText) {
      console.log('\n🔄 Testing Reversal:');
      const reversalResponse = await axios.post(
        `${API_BASE}/llm/sanitization/reverse-redactions`,
        {
          redactedText: response.data.sanitizedText,
          mappings: response.data.mappings,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        },
      ).catch(() => ({ data: { error: 'Reversal endpoint not available' } }));

      if (reversalResponse.data.originalText) {
        console.log(`   Reversed: ${reversalResponse.data.originalText.substring(0, 150)}...`);
        console.log(`   Reversal count: ${reversalResponse.data.reversalCount || 0}`);
        
        // Check if all emails were restored correctly
        const restored = reversalResponse.data.originalText;
        const hasAlice = restored.includes('alice@example.com');
        const hasBob = restored.includes('bob@support.example.com');
        const hasCharlie = restored.includes('charlie@tech.example.com');
        
        console.log('\n✅ Reversal Verification:');
        console.log(`   alice@example.com restored: ${hasAlice ? '✅' : '❌'}`);
        console.log(`   bob@support.example.com restored: ${hasBob ? '✅' : '❌'}`);
        console.log(`   charlie@tech.example.com restored: ${hasCharlie ? '✅' : '❌'}`);
      } else {
        console.log('   ⚠️  Reversal endpoint not available or failed');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testMultiplePatterns();


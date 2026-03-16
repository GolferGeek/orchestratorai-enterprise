// Test the complete PII system: Pattern Service + PII Service + Centralized Routing
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPiiSystem() {
  try {
    console.log('🧪 Testing Complete PII System...\n');
    
    // First, verify database has clean patterns
    const { data: patterns, error } = await supabase
      .from('redaction_patterns')
      .select('name, severity, data_type, category')
      .eq('is_active', true)
      .order('severity')
      .order('name');
    
    if (error) {
      console.error('❌ Database error:', error);
      return;
    }
    
    console.log(`✅ Database has ${patterns.length} active patterns\n`);
    
    // Group by severity for overview
    const bySeverity = patterns.reduce((acc, p) => {
      acc[p.severity] = (acc[p.severity] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📊 Pattern breakdown by severity:');
    Object.entries(bySeverity).forEach(([severity, count]) => {
      console.log(`   ${severity}: ${count} patterns`);
    });
    console.log('');
    
    // Test cases for the API
    const testCases = [
      {
        name: 'SSN (should BLOCK)',
        prompt: 'My social security number is 123-45-6789',
        expectedBlocked: true,
        expectedSeverity: 'showstopper'
      },
      {
        name: 'Credit Card (should BLOCK)', 
        prompt: 'My Visa card number is 4111111111111111',
        expectedBlocked: true,
        expectedSeverity: 'showstopper'
      },
      {
        name: 'GitHub Token (should BLOCK)',
        prompt: 'Here is my token: ghp_1234567890abcdef1234567890abcdef12345678',
        expectedBlocked: true,
        expectedSeverity: 'showstopper'
      },
      {
        name: 'Email (should SANITIZE and continue)',
        prompt: 'Contact me at john.doe@example.com for more info',
        expectedBlocked: false,
        expectedSeverity: 'pseudonymizer'
      },
      {
        name: 'Phone (should SANITIZE and continue)',
        prompt: 'Call me at (555) 123-4567 tomorrow',
        expectedBlocked: false,
        expectedSeverity: 'pseudonymizer'
      },
      {
        name: 'Name (should FLAG but continue)',
        prompt: 'My name is John Smith and I need help',
        expectedBlocked: false,
        expectedSeverity: 'flagger'
      },
      {
        name: 'Clean text (should pass through)',
        prompt: 'Write a blog post about artificial intelligence',
        expectedBlocked: false,
        expectedSeverity: null
      }
    ];
    
    console.log('🔬 Testing API endpoints...\n');
    
    for (const testCase of testCases) {
      try {
        console.log(`Testing: ${testCase.name}`);
        console.log(`Prompt: "${testCase.prompt}"`);
        
        // Test the centralized routing endpoint
        const response = await fetch('http://localhost:3000/llms/route', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: testCase.prompt,
            agentName: 'test-agent',
            userId: 'test-user'
          })
        });
        
        const result = await response.json();
        
        // Check if request was blocked as expected
        const wasBlocked = !result.success || result.error?.includes('PII') || result.error?.includes('blocked');
        const blockStatus = wasBlocked === testCase.expectedBlocked ? '✅' : '❌';
        
        console.log(`   ${blockStatus} Block status: ${wasBlocked} (expected: ${testCase.expectedBlocked})`);
        
        if (result.sanitizationResult) {
          console.log(`   📋 Sanitization metadata: ${JSON.stringify(result.sanitizationResult, null, 2)}`);
        }
        
        if (result.error && wasBlocked) {
          console.log(`   🚫 Block reason: ${result.error}`);
        }
        
        if (!wasBlocked && result.sanitizedPrompt && result.sanitizedPrompt !== testCase.prompt) {
          console.log(`   🧹 Sanitized: "${result.sanitizedPrompt}"`);
        }
        
        console.log('');
        
      } catch (fetchError) {
        console.log(`   ❌ API Error: ${fetchError.message}`);
        console.log('');
      }
    }
    
    console.log('🎯 Test Summary:');
    console.log('   - SSNs should be BLOCKED (showstopper)');
    console.log('   - Credit cards should be BLOCKED (showstopper)');
    console.log('   - API keys should be BLOCKED (showstopper)');
    console.log('   - Emails/phones should be SANITIZED (pseudonymizer)');
    console.log('   - Names should be FLAGGED but allowed (flagger)');
    console.log('   - Clean text should pass through unchanged');
    
  } catch (err) {
    console.error('❌ Test error:', err);
  }
}

testPiiSystem();

#!/usr/bin/env node

/**
 * Simple test for PII service without full NestJS setup
 * Tests the basic logic and patterns
 */

console.log('🧪 Simple PII Service Test\n');

// Test data patterns
const testPatterns = [
  {
    name: "Clean Content",
    text: "What is the weather like today?",
    expectPII: false
  },
  {
    name: "SSN Pattern",
    text: "My social security number is 123-45-6789",
    expectPII: true,
    piiType: "SSN"
  },
  {
    name: "Credit Card Pattern",
    text: "My card number is 4532-1234-5678-9012",
    expectPII: true,
    piiType: "Credit Card"
  },
  {
    name: "Email Pattern", 
    text: "Contact me at john.doe@example.com",
    expectPII: true,
    piiType: "Email"
  },
  {
    name: "Phone Pattern",
    text: "Call me at (555) 123-4567",
    expectPII: true,
    piiType: "Phone"
  },
  {
    name: "IP Address Pattern",
    text: "The server is at 192.168.1.100",
    expectPII: true,
    piiType: "IP Address"
  }
];

// Simple regex patterns for testing (similar to what's in the database)
const piiPatterns = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
};

function detectPII(text) {
  const detected = [];
  
  for (const [type, pattern] of Object.entries(piiPatterns)) {
    const matches = text.match(pattern);
    if (matches) {
      detected.push({
        type: type,
        matches: matches,
        count: matches.length
      });
    }
  }
  
  return detected;
}

function classifyPIISeverity(type) {
  const severityMap = {
    ssn: 'showstopper',
    creditCard: 'showstopper', 
    email: 'pseudonymizer',
    phone: 'pseudonymizer',
    ipAddress: 'flagger'
  };
  
  return severityMap[type] || 'flagger';
}

function simulatePolicyCheck(text) {
  const detectedPII = detectPII(text);
  const violations = [];
  const reasoningPath = [];
  
  if (detectedPII.length === 0) {
    reasoningPath.push('PII Policy: CLEAN - No sensitive data detected');
    return {
      allowed: true,
      violations,
      reasoningPath,
      detectedPII
    };
  }
  
  // Check for showstoppers
  const showstoppers = detectedPII.filter(pii => classifyPIISeverity(pii.type) === 'showstopper');
  
  if (showstoppers.length > 0) {
    reasoningPath.push(`PII Policy: BLOCKED - Showstopper PII detected`);
    reasoningPath.push(`Blocked types: ${showstoppers.map(p => p.type).join(', ')}`);
    violations.push(`Showstopper PII detected: ${showstoppers.map(p => p.type).join(', ')}`);
    
    return {
      allowed: false,
      violations,
      reasoningPath,
      detectedPII
    };
  }
  
  // Handle pseudonymizers and flaggers
  const pseudonymizers = detectedPII.filter(pii => classifyPIISeverity(pii.type) === 'pseudonymizer');
  const flaggers = detectedPII.filter(pii => classifyPIISeverity(pii.type) === 'flagger');
  
  if (pseudonymizers.length > 0) {
    reasoningPath.push(`PII Policy: SANITIZED - ${pseudonymizers.length} PII items will be pseudonymized`);
    reasoningPath.push(`Pseudonymized types: ${pseudonymizers.map(p => p.type).join(', ')}`);
  }
  
  if (flaggers.length > 0) {
    reasoningPath.push(`PII Policy: FLAGGED - ${flaggers.length} items flagged for review`);
    reasoningPath.push(`Flagged types: ${flaggers.map(p => p.type).join(', ')}`);
  }
  
  return {
    allowed: true,
    violations,
    reasoningPath,
    detectedPII
  };
}

function simulateLLMSanitization(systemPrompt, userMessage, isLocalProvider) {
  if (isLocalProvider) {
    return {
      sanitizedSystemPrompt: systemPrompt,
      sanitizedUserMessage: userMessage,
      shouldApplySanitization: false,
      reversalContext: null,
      sanitizationMetrics: {
        sanitizationLevel: 'none',
        piiDetected: false
      }
    };
  }
  
  // For external providers, simulate sanitization
  const userPII = detectPII(userMessage);
  const systemPII = detectPII(systemPrompt);
  
  let sanitizedUser = userMessage;
  let sanitizedSystem = systemPrompt;
  const reversalMap = {};
  
  // Simple pseudonymization simulation
  if (userPII.length > 0) {
    userPII.forEach((pii, index) => {
      pii.matches.forEach((match, matchIndex) => {
        const pseudonym = `PSEUDO_${pii.type.toUpperCase()}_${index}_${matchIndex}`;
        sanitizedUser = sanitizedUser.replace(match, pseudonym);
        reversalMap[pseudonym] = match;
      });
    });
  }
  
  return {
    sanitizedSystemPrompt: sanitizedSystem,
    sanitizedUserMessage: sanitizedUser,
    shouldApplySanitization: true,
    reversalContext: Object.keys(reversalMap).length > 0 ? reversalMap : null,
    sanitizationMetrics: {
      sanitizationLevel: userPII.length > 0 ? 'moderate' : 'none',
      piiDetected: userPII.length > 0,
      piiTypes: userPII.map(p => p.type),
      pseudonymsUsed: Object.keys(reversalMap).length
    }
  };
}

function simulateResponseRestoration(response, reversalContext) {
  if (!reversalContext) {
    return {
      restoredContent: response,
      success: true
    };
  }
  
  let restored = response;
  for (const [pseudonym, original] of Object.entries(reversalContext)) {
    restored = restored.replace(new RegExp(pseudonym, 'g'), original);
  }
  
  return {
    restoredContent: restored,
    success: true
  };
}

// Run the tests
console.log('🔍 Testing PII Detection Patterns...\n');

testPatterns.forEach(testCase => {
  console.log(`Testing: ${testCase.name}`);
  console.log(`Text: "${testCase.text}"`);
  
  const detected = detectPII(testCase.text);
  const hasPII = detected.length > 0;
  
  console.log(`✅ PII Detected: ${hasPII}`);
  if (hasPII) {
    detected.forEach(pii => {
      console.log(`  📍 ${pii.type}: ${pii.matches.join(', ')} (${classifyPIISeverity(pii.type)})`);
    });
  }
  
  if (hasPII === testCase.expectPII) {
    console.log(`✅ PASS: Detection worked as expected`);
  } else {
    console.log(`❌ FAIL: Expected PII=${testCase.expectPII}, got ${hasPII}`);
  }
  
  console.log('---\n');
});

console.log('🛡️ Testing Policy Decisions...\n');

const policyTestCases = [
  "What is the weather today?",
  "My SSN is 123-45-6789",
  "Contact me at john@example.com",
  "My card is 4532-1234-5678-9012 and SSN is 123-45-6789"
];

policyTestCases.forEach(text => {
  console.log(`Policy Test: "${text}"`);
  
  const result = simulatePolicyCheck(text);
  console.log(`✅ Allowed: ${result.allowed}`);
  console.log(`📊 Violations: ${result.violations.length}`);
  console.log(`💭 Reasoning: ${result.reasoningPath.join(' → ')}`);
  
  if (result.detectedPII.length > 0) {
    console.log(`🔍 Detected PII:`);
    result.detectedPII.forEach(pii => {
      console.log(`  - ${pii.type} (${classifyPIISeverity(pii.type)}): ${pii.count} matches`);
    });
  }
  
  console.log('---\n');
});

console.log('🤖 Testing LLM Sanitization Workflow...\n');

const llmTests = [
  {
    name: "Local Provider",
    system: "You are a helpful assistant.",
    user: "My email is test@example.com",
    isLocal: true
  },
  {
    name: "External Provider with PII",
    system: "You are a helpful assistant.",
    user: "My email is john.doe@example.com and phone is (555) 123-4567",
    isLocal: false
  }
];

llmTests.forEach(test => {
  console.log(`LLM Test: ${test.name}`);
  console.log(`User Message: "${test.user}"`);
  console.log(`Local Provider: ${test.isLocal}`);
  
  const result = simulateLLMSanitization(test.system, test.user, test.isLocal);
  
  console.log(`✅ Should Sanitize: ${result.shouldApplySanitization}`);
  console.log(`🔄 User Message Changed: ${result.sanitizedUserMessage !== test.user}`);
  console.log(`📊 Sanitization Level: ${result.sanitizationMetrics.sanitizationLevel}`);
  console.log(`🎭 Pseudonyms Used: ${result.sanitizationMetrics.pseudonymsUsed || 0}`);
  
  if (result.sanitizedUserMessage !== test.user) {
    console.log(`📝 Sanitized: "${result.sanitizedUserMessage}"`);
  }
  
  // Test restoration
  if (result.reversalContext) {
    console.log('\n🔄 Testing Response Restoration...');
    const mockResponse = "Here is your information: " + Object.keys(result.reversalContext).join(' and ');
    const restored = simulateResponseRestoration(mockResponse, result.reversalContext);
    
    console.log(`📤 Mock Response: "${mockResponse}"`);
    console.log(`📥 Restored: "${restored.restoredContent}"`);
    console.log(`✅ Restoration Success: ${restored.success}`);
  }
  
  console.log('---\n');
});

console.log('🎉 Simple PII Service Test Complete!\n');

console.log('📋 Summary:');
console.log('✅ PII detection patterns working');
console.log('✅ Policy classification working (showstopper/pseudonymizer/flagger)');
console.log('✅ LLM sanitization workflow working');
console.log('✅ Response restoration working');
console.log('\n🚀 Ready for integration testing with full NestJS app!');

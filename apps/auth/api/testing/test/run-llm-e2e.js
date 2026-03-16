#!/usr/bin/env node

/**
 * Quick E2E Test Runner for Unified LLM Architecture
 * 
 * This script runs the essential E2E tests to validate that the
 * unified LLM architecture is working correctly.
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Running Unified LLM Architecture E2E Tests...\n');

try {
  // Change to API directory
  process.chdir(path.join(__dirname, '..'));
  
  // Run the specific E2E test file
  const command = 'npm test -- --testPathPattern=unified-llm-e2e.spec.ts --verbose';
  
  console.log(`Executing: ${command}\n`);
  
  const result = execSync(command, { 
    stdio: 'inherit',
    encoding: 'utf8'
  });
  
  console.log('\n✅ All E2E tests completed successfully!');
  console.log('\n🎉 Unified LLM Architecture is working correctly!');
  
} catch (error) {
  console.error('\n❌ E2E tests failed:', error.message);
  console.error('\n🔧 Check the test output above for details.');
  process.exit(1);
}

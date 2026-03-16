# Test Coverage Standards and Best Practices

## Overview

This document establishes testing standards and best practices for the Orchestrator AI project to maintain high code quality and ensure reliable software delivery.

## Testing Philosophy

### CLAUDE.md Compliance
- **No Mocks or Fallbacks**: Tests use real functionality, real APIs, and real data
- **Real Integration Testing**: E2E tests connect to actual services
- **Fail Fast**: Tests reveal real problems rather than hiding them with fake success

### Testing Pyramid
```
    /\     E2E Tests (Integration & User Flows)
   /  \    
  /____\   Integration Tests (API & Component Integration)
 /______\  Unit Tests (Functions, Components, Services)
```

## Coverage Standards

### Minimum Coverage Thresholds

#### Global Coverage Requirements
- **Lines**: 75% minimum
- **Functions**: 75% minimum  
- **Branches**: 70% minimum
- **Statements**: 75% minimum

#### Critical Path Coverage Requirements  
- **Security & Validation**: 90% minimum
- **Authentication & Authorization**: 85% minimum
- **PII Handling**: 90% minimum
- **API Endpoints**: 80% minimum
- **Core Business Logic**: 85% minimum

#### File-Specific Thresholds
```javascript
// High-criticality files require higher coverage
'src/composables/useValidation.ts': 90%
'src/services/authService.ts': 85%
'src/services/piiService.ts': 90%
'src/stores/authStore.ts': 85%
'src/utils/sanitizationProfiles.ts': 90%
```

### Coverage Exclusions
- Configuration files (`*.config.ts`, `*.config.js`)
- Type definition files (`*.d.ts`)
- Test files themselves (`*.test.ts`, `*.spec.ts`)
- Generated files and build outputs
- Interface-only files without implementation

## Testing Standards by Type

### Unit Tests

#### Naming Convention
```typescript
// File: useValidation.test.ts
describe('useValidation', () => {
  describe('email validation', () => {
    it('should validate correct email addresses', () => {
      // Test implementation
    });
    
    it('should reject invalid email formats', () => {
      // Test implementation  
    });
  });
});
```

#### Structure Standards
- **Arrange-Act-Assert (AAA)** pattern
- Clear test descriptions using natural language
- One assertion per test when possible
- Proper setup and teardown

#### Example Standards
```typescript
// ✅ Good Test
it('should sanitize HTML while preserving safe content', () => {
  // Arrange
  const input = '<p>Safe content</p><script>alert("xss")</script>';
  const sanitizer = new HTMLSanitizer();
  
  // Act
  const result = sanitizer.sanitize(input);
  
  // Assert
  expect(result).toBe('<p>Safe content</p>');
  expect(result).not.toContain('<script>');
});

// ❌ Poor Test  
it('should work', () => {
  const result = doSomething();
  expect(result).toBeTruthy();
});
```

### Integration Tests

#### Requirements
- Test real API endpoints
- Use actual database connections
- Test cross-component interactions
- Verify data flow between layers

#### Example Structure
```typescript
describe('PII Service Integration', () => {
  beforeEach(async () => {
    // Real database setup
    await setupTestDatabase();
  });
  
  it('should detect PII and create pseudonym mappings', async () => {
    // Test real API call with actual data
    const response = await piiService.processPII('John Doe works at Acme Corp');
    
    expect(response.piiDetected).toBe(true);
    expect(response.mappings).toHaveLength(2); // Name and company
    expect(response.sanitized).not.toContain('John Doe');
  });
});
```

### E2E Tests

#### Critical User Journey Testing
- Authentication flows
- Core business workflows  
- Error scenarios and recovery
- Cross-browser compatibility

#### E2E Standards
```typescript
describe('PII Management Workflow', () => {
  it('should complete full PII pattern management lifecycle', () => {
    // Use real test user credentials
    cy.login('testuser@golfergeek.com', 'testuser01!');
    
    // Test actual workflow
    cy.visit('/app/admin/pii-patterns');
    cy.createPIIPattern('Social Security Number', /\d{3}-\d{2}-\d{4}/);
    cy.testPattern('123-45-6789');
    cy.verifyDetection('Social Security Number detected');
  });
});
```

## Test Organization

### Directory Structure
```
src/
├── tests/
│   ├── unit/                 # Unit tests
│   │   ├── components/       # Component tests
│   │   ├── services/         # Service tests  
│   │   ├── stores/          # Store tests
│   │   └── utils/           # Utility tests
│   ├── integration/          # Integration tests
│   │   ├── api/             # API integration
│   │   └── stores/          # Store integration
│   ├── e2e/                 # End-to-end tests
│   │   └── specs/           # E2E scenarios
│   ├── fixtures/            # Test data
│   ├── mocks/              # Mock implementations (use sparingly)
│   └── utils/              # Test utilities
```

### File Naming Conventions
- Unit tests: `ComponentName.test.ts`
- Integration tests: `serviceIntegration.test.ts`
- E2E tests: `user-workflow.cy.ts`
- Spec files: `ServiceName.spec.ts`

## Security Testing Standards

### Required Security Tests
1. **Input Validation Testing**
   - XSS attack vectors
   - SQL injection attempts
   - Path traversal attacks
   - Command injection patterns

2. **Authentication Testing**
   - Invalid credential handling
   - Session management
   - Token validation
   - Permission enforcement

3. **PII Protection Testing**
   - PII detection accuracy
   - Sanitization effectiveness
   - Pseudonym mapping integrity
   - Data masking verification

### Security Test Example
```typescript
describe('Security Validation', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src="x" onerror="alert(1)">',
    'javascript:alert("XSS")'
  ];
  
  xssPayloads.forEach(payload => {
    it(`should block XSS payload: ${payload}`, () => {
      const result = validateInput(payload);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('XSS_DETECTED');
    });
  });
});
```

## Performance Testing Standards

### Performance Test Requirements
- **Load Testing**: Simulate realistic user loads
- **Stress Testing**: Test beyond normal capacity
- **Bundle Size**: Monitor build output sizes
- **Memory Leaks**: Detect memory usage issues

### Performance Benchmarks
```typescript
it('should validate input within performance threshold', () => {
  const startTime = performance.now();
  
  validateComplexInput(largeInputData);
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  expect(duration).toBeLessThan(100); // 100ms threshold
});
```

## Continuous Integration Standards

### Pre-commit Requirements
- All tests must pass
- Coverage thresholds must be met
- No linting errors
- Type checking passes

### CI Pipeline Standards
```yaml
name: Test & Coverage
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Unit Tests
        run: npm run test:unit
        
      - name: Integration Tests  
        run: npm run test:integration
        
      - name: E2E Tests (Critical Path)
        run: npm run test:e2e:critical
        
      - name: Coverage Report
        run: npm run test:coverage
        
      - name: Coverage Check
        run: npm run coverage:check
```

## Test Data Management

### Test Data Principles
- **Isolation**: Each test uses independent data
- **Cleanup**: Always clean up after tests
- **Realistic**: Use production-like data
- **Security**: No real PII in test data

### Test Fixtures
```typescript
// fixtures/testUsers.ts
export const testUsers = {
  regular: {
    email: 'testuser@golfergeek.com',
    password: 'testuser01!',
    role: 'user'
  },
  admin: {
    email: 'admin@example.com', 
    password: 'admin123',
    role: 'admin'
  }
};
```

## Quality Gates

### Coverage Gates
- **New Code**: 80% coverage minimum
- **Overall**: 75% coverage maintained
- **Critical Files**: 90% coverage required
- **Regression**: Coverage cannot decrease

### Quality Metrics
- **Test Execution Time**: < 10 minutes for full suite
- **Flaky Test Rate**: < 2%  
- **Test Maintenance**: Regular review and cleanup
- **Documentation**: All critical tests documented

## Tools and Configuration

### Recommended Tools
- **Unit Testing**: Vitest (fast, modern)
- **E2E Testing**: Cypress (comprehensive)
- **Coverage**: @vitest/coverage-v8
- **Component Testing**: Vue Test Utils
- **API Testing**: Supertest or direct API calls

### Configuration Standards
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        global: {
          branches: 70,
          functions: 75,
          lines: 75,
          statements: 75
        }
      },
      exclude: [
        'node_modules',
        'src/tests/**',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  }
});
```

## Common Anti-Patterns to Avoid

### ❌ Bad Practices
- Testing implementation details instead of behavior
- Overly complex test setup
- Tests that depend on external state
- Generic test names like "should work"
- Testing multiple concerns in single test
- Ignoring test failures

### ✅ Good Practices
- Test behavior and outcomes
- Clear, focused test cases
- Independent, isolated tests
- Descriptive test names
- Single responsibility per test
- Fix failing tests immediately

## Review and Maintenance

### Regular Test Maintenance
- **Monthly**: Review flaky tests
- **Quarterly**: Update test data and fixtures  
- **Release**: Full regression testing
- **Continuous**: Monitor coverage trends

### Test Review Checklist
- [ ] Tests cover happy and error paths
- [ ] Test names clearly describe what's being tested
- [ ] No flaky or intermittent failures
- [ ] Coverage thresholds maintained
- [ ] Security test vectors current
- [ ] Performance benchmarks realistic

---

*This document should be reviewed quarterly and updated as testing practices evolve.*
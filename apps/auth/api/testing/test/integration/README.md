# LLM Service Integration Tests

This directory contains comprehensive integration tests for the centralized LLM service and intelligent routing system.

## Test Suites

### 1. `llm-routing-integration.e2e-spec.ts`
Tests intelligent routing based on complexity levels:
- Routes simple tasks to local models when available
- Routes complex reasoning tasks appropriately  
- Respects explicit provider preferences
- Handles fallback routing when preferred provider fails
- Validates local model status integration
- Tests API endpoint integration
- Measures performance characteristics

### 2. `llm-tracking-integration.e2e-spec.ts`
Tests usage tracking and runId correlation:
- Generates unique runIds for each request
- Stores usage records with caller tracking
- Tracks different caller types correctly
- Provides usage analytics via API
- Tracks data classification properly
- Links multiple requests to same conversation

### 3. `llm-headers-integration.e2e-spec.ts`
Tests no-train headers for external providers:
- Sends `anthropic-beta: no-train` header to Anthropic
- Sends `OpenAI-No-Train: true` header to OpenAI
- Sends appropriate headers to Google
- Maintains header consistency across requests
- Validates local providers don't receive unnecessary headers

### 4. `llm-fallback-integration.e2e-spec.ts`
Tests error handling and fallback mechanisms:
- Fallback from external provider to local when external fails
- Fallback between external providers
- Model-specific fallbacks
- Meaningful error messages when all providers fail
- Timeout scenario handling
- Context preservation during fallback
- Quick fallback performance

### 5. `llm-performance-integration.e2e-spec.ts`
Tests performance baselines and measurements:
- Establishes baseline performance for simple local requests
- Measures performance differences between complexity levels
- Tests concurrent request performance
- Monitors resource usage patterns
- Tracks response time trends
- Validates optimization benefits

## Running Tests

### Prerequisites
1. API server running on port 7000
2. Supabase connection configured
3. Ollama running locally (optional, but improves test coverage)

### Run All Integration Tests
```bash
cd apps/api
npm run test:e2e -- test/integration
```

### Run Individual Test Suites
```bash
# Routing tests
npm run test:e2e -- test/integration/llm-routing-integration.e2e-spec.ts

# Tracking tests
npm run test:e2e -- test/integration/llm-tracking-integration.e2e-spec.ts

# Headers tests
npm run test:e2e -- test/integration/llm-headers-integration.e2e-spec.ts

# Fallback tests
npm run test:e2e -- test/integration/llm-fallback-integration.e2e-spec.ts

# Performance tests
npm run test:e2e -- test/integration/llm-performance-integration.e2e-spec.ts
```

### Run with Verbose Output
```bash
npm run test:e2e -- test/integration --verbose
```

## Test Environment

These tests are designed to work with:
- **Local Environment**: Tests will adapt based on available providers
- **Ollama**: Local model tests will run if Ollama is available
- **External Providers**: Tests will mock external APIs when API keys are not available
- **Database**: Tests require a working Supabase connection for usage tracking

## Expected Outcomes

### Successful Test Run Indicators
- ✅ All routing decisions are intelligent and appropriate
- ✅ Usage tracking records are created in database
- ✅ No-train headers are sent to external providers
- ✅ Fallback mechanisms work correctly
- ✅ Performance meets established baselines
- ✅ No direct provider usage violations detected

### Performance Baselines
- Simple local requests: < 30 seconds average
- Concurrent requests (5): < 2 minutes total
- Fallback scenarios: < 10 seconds for quick fallback

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Ensure Supabase is configured correctly
   - Check environment variables in `.env`

2. **Ollama Not Available**
   - Tests will skip local model tests gracefully
   - Consider starting Ollama for full test coverage

3. **External API Errors**
   - Tests use mocking for most external API calls
   - Real API calls only occur when testing actual integration

4. **Timeout Issues**
   - Increase Jest timeout in test configuration
   - Check if models are loaded and responsive

### Debug Mode
```bash
npm run test:e2e -- test/integration --detectOpenHandles --forceExit
```

## Contributing

When adding new integration tests:
1. Follow the existing naming convention
2. Include both positive and negative test cases
3. Mock external dependencies appropriately
4. Add performance measurements where relevant
5. Update this README with new test descriptions

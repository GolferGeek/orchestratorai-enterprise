# Comprehensive Test Plan: Name-Based Usage Tracking Validation

## Overview
This test plan validates that the entire LLM system correctly tracks usage with provider/model names (no UUIDs) and ensures no null errors occur in the name-based architecture.

## Test Categories

### 1. Backend Unit Tests (Jest)

#### 1.1 LLM Service Tests
- **Test**: `generateResponse()` with name-based parameters
  - Input: `providerName: 'openai', modelName: 'gpt-4o-mini'`
  - Verify: Usage record created with correct names
  - Assert: No UUID fields in usage data

- **Test**: `generateEnhancedResponse()` with name-based parameters
  - Input: Various provider/model combinations
  - Verify: Metadata contains correct provider/model names
  - Assert: No null values in tracking fields

- **Test**: Provider/model name extraction from LLM responses
  - Mock: LLM response with metadata
  - Verify: Correct names extracted and stored
  - Assert: Fallback to default names when metadata missing

#### 1.2 Models Service Tests
- **Test**: `findAllNames()` endpoint functionality
  - Verify: Returns correct ModelNameDto format
  - Assert: No UUID fields in response
  - Test: Caching behavior (hit/miss scenarios)

- **Test**: `findByModelId()` → `findByModelName()` migration
  - Input: Provider name + model name
  - Verify: Correct model found
  - Assert: No UUID-based lookups

#### 1.3 Providers Service Tests
- **Test**: `findAllNames()` and `findAllWithModels()` endpoints
  - Verify: Correct DTO formats returned
  - Assert: No UUID fields in responses
  - Test: Cache expiration and refresh

### 2. Integration Tests (E2E)

#### 2.1 Agent Call Flow Tests
- **Test**: Complete agent call with usage tracking
  - Flow: Frontend → API → Agent → LLM → Usage Record
  - Verify: End-to-end name propagation
  - Assert: Database record has correct provider/model names

- **Test**: Multiple concurrent agent calls
  - Scenario: Different providers/models simultaneously
  - Verify: Each call tracked with correct names
  - Assert: No cross-contamination of usage data

#### 2.2 API Endpoint Tests
- **Test**: New name-based endpoints
  - `GET /providers/names`
  - `GET /providers/with-models`
  - `GET /models/names`
  - Verify: Correct response formats
  - Assert: No UUID fields anywhere

- **Test**: Sovereign mode filtering
  - Input: `sovereign_mode=true`
  - Verify: Only local models returned
  - Assert: Correct provider names (ollama only)

### 3. Frontend Integration Tests (Playwright)

#### 3.1 UI Component Tests
- **Test**: LLM selector dropdowns
  - Verify: Display provider/model names (not UUIDs)
  - Test: Selection updates state correctly
  - Assert: API calls use names in payloads

- **Test**: Usage analytics display
  - Verify: Charts show provider/model names
  - Test: Filtering by provider/model names
  - Assert: No UUID references in UI

#### 3.2 End-to-End User Flows
- **Test**: Complete chat session with LLM selection
  - Flow: Select provider/model → Send message → View usage
  - Verify: Usage displayed with correct names
  - Assert: No null values in usage display

### 4. Database Validation Tests

#### 4.1 Schema Validation
- **Test**: Database schema compliance
  - Verify: No UUID foreign keys between providers/models
  - Assert: All name-based columns exist and populated
  - Test: Constraints and indexes on name fields

#### 4.2 Usage Records Validation
- **Test**: Usage table data integrity
  - Query: Recent usage records
  - Verify: All records have provider/model names
  - Assert: No null or UUID values in name fields

### 5. Regression Tests

#### 5.1 Legacy UUID Detection
- **Test**: Codebase scan for UUID references
  - Search: `providerId`, `modelId`, UUID patterns
  - Verify: Only legacy fallback code remains
  - Assert: No active UUID-based logic

#### 5.2 Error Handling Tests
- **Test**: Missing provider/model scenarios
  - Input: Invalid provider/model names
  - Verify: Graceful fallback to defaults
  - Assert: No null errors or crashes

## Test Data Requirements

### Provider/Model Combinations to Test
1. **OpenAI**: `openai` + `gpt-4o-mini`
2. **Anthropic**: `anthropic` + `claude-3.5-sonnet-20241022`
3. **Google**: `google` + `gemini-2.5-flash`
4. **Grok**: `grok` + `grok-2-mini`
5. **Ollama**: `ollama` + `llama3.2:latest`

### Edge Cases to Test
1. **Missing provider name** → Should default to 'openai'
2. **Missing model name** → Should default to 'o1-mini'
3. **Invalid provider/model combo** → Should use fallback
4. **Null/undefined values** → Should handle gracefully

## Success Criteria

### ✅ Must Pass
1. **Zero UUID references** in active code paths
2. **All usage records** contain provider/model names
3. **No null errors** in any test scenario
4. **Frontend displays names** correctly throughout
5. **API endpoints return names** in correct format
6. **Database queries use names** for all lookups
7. **Caching works correctly** for name-based endpoints

### 📊 Performance Targets
1. **API response times** < 100ms for cached name endpoints
2. **Database queries** use proper indexes on name fields
3. **Cache hit rate** > 80% for provider/model lists

### 🔒 Security Requirements
1. **No sensitive data exposure** in name-only endpoints
2. **Proper authentication** on all endpoints
3. **Input validation** for provider/model names

## Test Execution Plan

### Phase 1: Backend Validation
1. Run existing Jest test suite
2. Add new name-based usage tracking tests
3. Validate database schema and data

### Phase 2: API Integration
1. Test new name-based endpoints
2. Validate caching behavior
3. Test error handling scenarios

### Phase 3: Frontend Integration
1. Update Playwright tests for name-based UI
2. Test complete user flows
3. Validate usage analytics display

### Phase 4: Regression & Performance
1. Run full regression test suite
2. Performance testing of new endpoints
3. Load testing with concurrent requests

## Test Environment Setup

### Required Services
- ✅ NestJS API server
- ✅ Supabase database with migrated schema
- ✅ Frontend Vue.js application
- ✅ Test authentication credentials

### Test Data Setup
- ✅ Populated providers table (openai, anthropic, google, grok, ollama)
- ✅ Populated models table with name-based relationships
- ✅ Test user accounts for authentication
- ✅ Clean usage tracking tables for validation

This comprehensive test plan ensures complete validation of the name-based LLM system with zero tolerance for UUID references or null errors.

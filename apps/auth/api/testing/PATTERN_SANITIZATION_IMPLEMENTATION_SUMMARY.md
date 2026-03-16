# Pattern-Based Sanitization Implementation Summary

## ✅ Implementation Complete

All code changes have been implemented and tested for basic functionality. The following components are in place:

### 1. Core Services Created
- ✅ **PatternRedactionService** (`apps/api/src/llms/pii/pattern-redaction.service.ts`)
  - `redactPatterns()` - Applies pattern-based redactions with reversibility
  - `reverseRedactions()` - Reverses pattern redactions back to original values
  - Loads replacement values from `redaction_patterns` table

### 2. Type Definitions Updated
- ✅ **PIIProcessingMetadata** - Added pattern redaction fields
- ✅ **LLMUsageMetrics** - Added `showstopperDetected`, `patternRedactionsApplied`, `patternRedactionTypes`

### 3. Integration Points
- ✅ **LLMService.generateResponse()** - Integrated pattern redaction after dictionary pseudonymization
- ✅ **CentralizedRoutingService.processAgentResponse()** - Updated to reverse pattern redactions first, then pseudonyms
- ✅ **BaseLLMService.trackUsage()** - Extracts pattern redaction and showstopper flags
- ✅ **RunMetadataService.updateUsageRecord()** - Persists all flags to database

### 4. Database Migration
- ✅ **Migration Created**: `20250205000001_add_showstopper_detected_to_llm_usage.sql`
- ✅ **Migration Applied**: Column `showstopper_detected` added to `llm_usage` table

### 5. Module Configuration
- ✅ **LLMModule** - Added `PatternRedactionService` to providers and exports

## 🧪 Test Files Created

### Comprehensive E2E Tests
1. **`apps/api/testing/test/integration/pattern-sanitization.e2e-spec.ts`**
   - Jest-based test suite
   - Tests all combinations of show-stoppers, patterns, and pseudonyms
   - Verifies database records

2. **`apps/api/testing/test-pattern-sanitization-e2e.js`**
   - Standalone Node.js test script
   - More verbose output for debugging
   - Tests through agent endpoints

3. **`apps/api/testing/test-pattern-sanitization-quick.js`**
   - Quick verification script
   - Tests sanitization endpoints directly
   - Verifies database schema

## 📋 Test Plan

See `apps/api/testing/PATTERN_SANITIZATION_TEST_PLAN.md` for detailed test cases.

## 🔍 Testing Instructions

### Quick Verification (No LLM Calls)
```bash
node apps/api/testing/test-pattern-sanitization-quick.js
```

### Full E2E Tests (Makes Real LLM Calls)
```bash
# Standalone script (recommended for debugging)
node apps/api/testing/test-pattern-sanitization-e2e.js

# Jest suite
npx jest --config apps/api/testing/test/jest-e2e.json pattern-sanitization.e2e-spec
```

### Manual Testing via Agent Endpoint

1. **Authenticate**:
```bash
curl -X POST http://localhost:6100/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo.user@orchestratorai.io","password":"DemoUser123!"}'
```

2. **Test Show-stopper (Should Block)**:
```bash
curl -X POST http://localhost:6100/agent-to-agent/demo-org/blog-post-writer/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "userMessage": "Write about someone with SSN 123-45-6789",
    "mode": "converse",
    "context": {
      "orgSlug": "demo-org",
      "agentSlug": "blog-post-writer",
      "agentType": "context",
      "userId": "b29a590e-b07f-49df-a25b-574c956b5035",
      "conversationId": "00000000-0000-0000-0000-000000000000",
      "taskId": "00000000-0000-0000-0000-000000000000",
      "planId": "00000000-0000-0000-0000-000000000000",
      "deliverableId": "00000000-0000-0000-0000-000000000000",
      "provider": "openai",
      "model": "gpt-4o-mini"
    },
    "payload": {}
  }'
```

3. **Test Pattern Redaction (Should Process and Reverse)**:
```bash
# Replace userMessage with: "Contact us at test@example.com or call 555-123-4567"
```

4. **Test Pseudonymization (Should Process and Reverse)**:
```bash
# Replace userMessage with: "Write about GolferGeek who works at Orchestrator AI"
```

5. **Verify Database Record**:
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -c "
  SELECT 
    showstopper_detected,
    pii_detected,
    pseudonyms_used,
    redactions_applied,
    redaction_types,
    pseudonym_types,
    data_sanitization_applied,
    sanitization_level
  FROM llm_usage
  ORDER BY created_at DESC
  LIMIT 1;
"
```

## 🎯 Expected Behavior

### Flow for External Providers (non-Ollama):

1. **Show-stopper Detection** (in `CentralizedRoutingService.determineRoute()`)
   - If showstopper detected → Request blocked immediately
   - `showstopper_detected = true` in database
   - No LLM call made

2. **Dictionary Pseudonymization** (in `LLMService.generateResponse()`)
   - Applied before LLM call
   - Mappings stored for reversal

3. **Pattern Redaction** (in `LLMService.generateResponse()`)
   - Applied after pseudonymization
   - Mappings stored for reversal
   - Excludes showstoppers (they should block, not redact)

4. **LLM Call**
   - Made with sanitized text

5. **Reversal** (in `LLMService.generateResponse()`)
   - Pattern redactions reversed first
   - Dictionary pseudonyms reversed second
   - Original values returned to user

6. **Database Tracking** (in `BaseLLMService.trackUsage()`)
   - All flags extracted from PII metadata
   - Written to `llm_usage` table

### Flow for Local Providers (Ollama):

- Skip all sanitization (local bypass)
- `is_local = true` in database
- No pattern redaction or pseudonymization applied

## 🔍 Verification Checklist

- [ ] Show-stoppers block requests before LLM call
- [ ] Patterns are redacted before LLM call
- [ ] Pseudonyms are applied before LLM call
- [ ] Both patterns and pseudonyms work together
- [ ] Pattern redactions are reversed first
- [ ] Dictionary pseudonyms are reversed second
- [ ] Original values appear in user-facing responses
- [ ] Database records show correct flags:
  - [ ] `showstopper_detected` (boolean)
  - [ ] `pii_detected` (boolean)
  - [ ] `pseudonyms_used` (integer)
  - [ ] `pseudonym_types` (jsonb array)
  - [ ] `redactions_applied` (integer)
  - [ ] `redaction_types` (jsonb array)
  - [ ] `data_sanitization_applied` (boolean)
  - [ ] `sanitization_level` (text)

## 📝 Notes

- Pattern redaction uses replacement values from `redaction_patterns.replacement` column
- If no replacement specified, uses `[TYPE_REDACTED]` format
- Show-stoppers are excluded from pattern redaction (they should block, not redact)
- Reversal order matters: patterns first, then pseudonyms
- Local providers (Ollama) skip all sanitization


# Pattern-Based Sanitization E2E Test Plan

## Overview
Comprehensive end-to-end tests for pattern-based sanitization, pseudonymization, and show-stopper detection.

## Test Files Created

1. **`apps/api/testing/test/integration/pattern-sanitization.e2e-spec.ts`**
   - Jest-based E2E test suite
   - Run with: `npx jest --config apps/api/testing/test/jest-e2e.json pattern-sanitization.e2e-spec`

2. **`apps/api/testing/test-pattern-sanitization-e2e.js`**
   - Standalone Node.js test script
   - Run with: `node apps/api/testing/test-pattern-sanitization-e2e.js`

## Test Cases

### 1. Show-stoppers Only (Should Block)
- ✅ SSN: `123-45-6789`
- ✅ Credit Card: `4532-1234-5678-9010`
- **Expected**: Request blocked, `showstopper_detected = true` in database

### 2. Pattern Redaction Only (Should Redact and Reverse)
- ✅ Email: `test@example.com`
- ✅ Phone: `555-123-4567`
- ✅ IP Address: `192.168.1.1`
- **Expected**: 
  - Request processed
  - Patterns redacted before LLM call
  - Original values restored in response
  - `redactions_applied > 0`, `redaction_types` includes pattern types

### 3. Dictionary Pseudonymization Only (Should Pseudonymize and Reverse)
- ✅ GolferGeek → @user_golfer
- ✅ Orchestrator AI → @company_orchestrator
- ✅ Matt Weber → @person_matt_weber
- **Expected**:
  - Request processed
  - Names pseudonymized before LLM call
  - Original names restored in response
  - `pseudonyms_used > 0`, `pseudonym_types` populated

### 4. Patterns + Pseudonyms (Both Should Work Together)
- ✅ Email + GolferGeek
- ✅ Phone + Matt Weber + Orchestrator AI
- ✅ Multiple patterns + multiple pseudonyms
- **Expected**:
  - Both applied before LLM call
  - Both reversed after LLM call (patterns first, then pseudonyms)
  - `pseudonyms_used > 0` AND `redactions_applied > 0`
  - `data_sanitization_applied = true`
  - `sanitization_level = 'standard'`

### 5. Show-stoppers + Patterns (Show-stoppers Should Block)
- ✅ SSN + Email
- **Expected**: Request blocked, patterns not applied

### 6. Show-stoppers + Pseudonyms (Show-stoppers Should Block)
- ✅ Credit Card + GolferGeek
- **Expected**: Request blocked, pseudonyms not applied

### 7. All Three (Show-stoppers Should Block Everything)
- ✅ SSN + Email + GolferGeek + Orchestrator AI
- **Expected**: Request blocked, nothing applied

### 8. Local Provider (Ollama) - Should Skip Sanitization
- ✅ Using `ollama` provider
- **Expected**: 
  - Request processed
  - No sanitization applied (local bypass)
  - `is_local = true`

## Database Verification

Each test verifies the `llm_usage` table contains:
- `showstopper_detected` (boolean)
- `pii_detected` (boolean)
- `pseudonyms_used` (integer)
- `pseudonym_types` (jsonb array)
- `redactions_applied` (integer)
- `redaction_types` (jsonb array)
- `data_sanitization_applied` (boolean)
- `sanitization_level` (text: 'none' | 'basic' | 'standard' | 'strict')

## Test Data from Database

### Show-stoppers (from `redaction_patterns` table):
- **SSN**: `\b\d{3}-\d{2}-\d{4}\b` (severity: showstopper)
- **Credit Card**: `\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b` (severity: showstopper)

### Patterns (from `redaction_patterns` table):
- **Email**: `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b` (severity: flagger)
- **Phone**: `\b(\+1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b` (severity: flagger)
- **IP Address**: `\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b` (severity: flagger)

### Pseudonyms (from `pseudonym_dictionaries` table):
- **GolferGeek** → `@user_golfer`
- **Orchestrator AI** → `@company_orchestrator`
- **Matt Weber** → `@person_matt_weber`
- **Matthew Weber** → `@person_matthew_weber`

## Authentication

Tests use:
- **Email**: `demo.user@orchestratorai.io` (or `SUPABASE_TEST_USER` env var)
- **Password**: `DemoUser123!` (or `SUPABASE_TEST_PASSWORD` env var)
- **User ID**: `b29a590e-b07f-49df-a25b-574c956b5035` (or `SUPABASE_TEST_USERID` env var)

## Running Tests

### Standalone Script (Recommended for Quick Testing)
```bash
node apps/api/testing/test-pattern-sanitization-e2e.js
```

### Jest E2E Suite
```bash
npx jest --config apps/api/testing/test/jest-e2e.json pattern-sanitization.e2e-spec
```

## Prerequisites

1. API server running on `localhost:6100`
2. Supabase running locally
3. Test user exists in database
4. External LLM provider configured (OpenAI, Anthropic, etc.) for non-local tests
5. Environment variables set (optional):
   - `API_URL` (default: `http://localhost:6100`)
   - `SUPABASE_TEST_USER` (default: `demo.user@orchestratorai.io`)
   - `SUPABASE_TEST_PASSWORD` (default: `DemoUser123!`)
   - `SUPABASE_TEST_USERID` (default: `b29a590e-b07f-49df-a25b-574c956b5035`)

## Expected Test Duration

- Each test makes real LLM calls (unless using Ollama)
- Estimated time: 2-5 minutes per test case
- Full suite: ~20-30 minutes

## Success Criteria

1. ✅ Show-stoppers block requests before LLM call
2. ✅ Patterns are redacted before LLM call and reversed after
3. ✅ Pseudonyms are applied before LLM call and reversed after
4. ✅ Both patterns and pseudonyms work together
5. ✅ Show-stoppers take precedence over patterns and pseudonyms
6. ✅ Database records correctly track all flags
7. ✅ Local providers skip sanitization
8. ✅ Original values are restored in user-facing responses


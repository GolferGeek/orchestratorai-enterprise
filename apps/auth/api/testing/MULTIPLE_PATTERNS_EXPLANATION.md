# Multiple Patterns of Same Type - How It Works

## Overview

When you have multiple instances of the same pattern type (e.g., three email addresses), the system handles them correctly by:

1. **Detecting all instances** - Each instance is detected separately with its own position
2. **Creating unique placeholders** - Each instance gets a unique placeholder to enable accurate reversal
3. **Storing individual mappings** - Each redaction has its own mapping entry
4. **Reversing accurately** - Each placeholder reverses to its correct original value

## Example: Three Email Addresses

### Input Text
```
Contact Alice at alice@example.com for sales inquiries.
For support, email bob@support.example.com.
Technical questions go to charlie@tech.example.com.
```

### Step 1: Detection
The `PIIPatternService.detectPII()` method finds all three emails:
- `alice@example.com` at position X
- `bob@support.example.com` at position Y  
- `charlie@tech.example.com` at position Z

### Step 2: Redaction
The `PatternRedactionService.redactPatterns()` method processes each match:

**First email (alice@example.com)**:
- Redacted to: `[EMAIL_REDACTED]` (no suffix for first instance)
- Mapping stored: `{ original: "alice@example.com", redacted: "[EMAIL_REDACTED]" }`

**Second email (bob@support.example.com)**:
- Redacted to: `[EMAIL_REDACTED]_2` (suffix added for second instance)
- Mapping stored: `{ original: "bob@support.example.com", redacted: "[EMAIL_REDACTED]_2" }`

**Third email (charlie@tech.example.com)**:
- Redacted to: `[EMAIL_REDACTED]_3` (suffix added for third instance)
- Mapping stored: `{ original: "charlie@tech.example.com", redacted: "[EMAIL_REDACTED]_3" }`

### Step 3: Redacted Text
```
Contact Alice at [EMAIL_REDACTED] for sales inquiries.
For support, email [EMAIL_REDACTED]_2.
Technical questions go to [EMAIL_REDACTED]_3.
```

### Step 4: LLM Processing
The LLM receives the redacted text and generates a response. The LLM may:
- Reference the placeholders: "Contact [EMAIL_REDACTED] for sales"
- Use the placeholders in context: "For support, reach out to [EMAIL_REDACTED]_2"
- Generate new content that includes the placeholders

### Step 5: Reversal
The `reverseRedactions()` method processes each mapping:

1. Finds `[EMAIL_REDACTED]` → Replaces with `alice@example.com`
2. Finds `[EMAIL_REDACTED]_2` → Replaces with `bob@support.example.com`
3. Finds `[EMAIL_REDACTED]_3` → Replaces with `charlie@tech.example.com`

**Result**: Each placeholder is correctly restored to its original email address.

## Key Implementation Details

### Unique Placeholder Generation

```typescript
// Track counts per data type
const typeCounts: Record<string, number> = {};

// For each match:
const instanceNumber = ++typeCounts[dataType];
const replacement = instanceNumber > 1
  ? `${baseReplacement}_${instanceNumber}`
  : baseReplacement;
```

**Why this works:**
- First instance: `[EMAIL_REDACTED]` (clean, no suffix)
- Second instance: `[EMAIL_REDACTED]_2` (unique)
- Third instance: `[EMAIL_REDACTED]_3` (unique)
- Each placeholder maps to exactly one original value

### Reversal Logic

```typescript
// Process mappings sorted by length (longest first)
// This ensures `[EMAIL_REDACTED]_3` is replaced before `[EMAIL_REDACTED]`
// to avoid partial matches

for (const mapping of sortedMappings) {
  const regex = new RegExp(escapedRedacted, 'g');
  processedText = processedText.replace(regex, mapping.originalValue);
}
```

**Why this works:**
- Placeholders are unique, so each regex match is unambiguous
- Sorting by length ensures longer placeholders (with suffixes) are processed first
- Each placeholder reverses to exactly one original value

## Edge Cases Handled

### 1. Single Instance
- **Input**: One email `alice@example.com`
- **Redacted**: `[EMAIL_REDACTED]` (no suffix needed)
- **Reversal**: Works correctly

### 2. Multiple Instances of Same Value
- **Input**: `alice@example.com` appears twice
- **Redacted**: `[EMAIL_REDACTED]` and `[EMAIL_REDACTED]_2`
- **Reversal**: Both restore to `alice@example.com` correctly

### 3. Mixed Pattern Types
- **Input**: Two emails and one phone number
- **Redacted**: `[EMAIL_REDACTED]`, `[EMAIL_REDACTED]_2`, `[PHONE_REDACTED]`
- **Reversal**: Each type reverses independently

### 4. LLM Modifies Placeholders
- **Scenario**: LLM changes `[EMAIL_REDACTED]_2` to `[EMAIL_REDACTED]`
- **Result**: Only exact matches are reversed, so the modified placeholder won't match
- **Note**: This is expected behavior - the LLM shouldn't modify placeholders

## Database Storage

Each redaction creates a mapping entry in the `patternRedactionMappings` array:

```typescript
{
  originalValue: "alice@example.com",
  redactedValue: "[EMAIL_REDACTED]",
  dataType: "email",
  startIndex: 20,
  endIndex: 38,
  patternName: "Email - Generic"
}
```

These mappings are stored in:
- `PIIProcessingMetadata.patternRedactionMappings`
- Persisted in `llm_usage` table (as JSON)
- Used for reversal after LLM response

## Testing

To test multiple patterns:

```bash
node apps/api/testing/test-multiple-patterns.js
```

Or use the E2E test suite:
```bash
node apps/api/testing/test-pattern-sanitization-e2e.js
```

## Summary

✅ **Multiple instances are detected** - Each instance is found separately  
✅ **Unique placeholders are created** - Each instance gets a unique identifier  
✅ **Mappings are stored individually** - Each redaction has its own mapping  
✅ **Reversal is accurate** - Each placeholder restores to its correct original value  

The system correctly handles any number of instances of the same pattern type!


#!/bin/bash

# Fix PII Service Tests - TypeScript Errors
# This script fixes all type errors in the newly created PII service tests

echo "🔧 Fixing PII service test files..."

cd src/llms/pii

# Fix 1: Change severity: 'info' to severity: 'flagger'
echo "  📝 Fixing severity types..."
sed -i '' "s/severity: 'info'/severity: 'flagger'/g" pii.service.spec.ts
sed -i '' "s/severity: 'info'/severity: 'flagger'/g" pattern-redaction.service.spec.ts

# Fix 2: Change processingTimeMs to processingTime
echo "  📝 Fixing processing time property..."
sed -i '' 's/processingTimeMs:/processingTime:/g' pii.service.spec.ts
sed -i '' 's/processingTimeMs:/processingTime:/g' pattern-redaction.service.spec.ts

# Fix 3: Add non-null assertions for array access
echo "  📝 Adding non-null assertions..."

# Dictionary pseudonymizer
sed -i '' 's/result\.mappings\[0\]\./result.mappings[0]!./g' dictionary-pseudonymizer.service.spec.ts
sed -i '' 's/result\.mappings\[1\]\./result.mappings[1]!./g' dictionary-pseudonymizer.service.spec.ts
sed -i '' 's/dictionary\[0\]\./dictionary[0]!./g' dictionary-pseudonymizer.service.spec.ts

# Pattern redaction
sed -i '' 's/result\.mappings\[0\]\./result.mappings[0]!./g' pattern-redaction.service.spec.ts
sed -i '' 's/result\.mappings\[1\]\./result.mappings[1]!./g' pattern-redaction.service.spec.ts
sed -i '' 's/result\.mappings\[2\]\./result.mappings[2]!./g' pattern-redaction.service.spec.ts

echo "✅ All fixes applied!"
echo ""
echo "Now run the tests:"
echo "  cd ../.."
echo "  npm test -- --testPathPattern=\"pii.*\\.spec\\.ts$\" --coverage"

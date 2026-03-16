#!/bin/bash

# Fix redundant type constituents in repository spec files
# Replace "unknown | null" with "unknown" and "unknown[] | null" with "unknown"

FILES=(
  "src/prediction-runner/repositories/__tests__/learning-lineage.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/learning-queue.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/replay-test.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/learning.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/prediction.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/predictor.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/strategy.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/scenario-run.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/snapshot.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/target-snapshot.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/signal.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/target.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/test-article.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/test-audit-log.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/test-scenario.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/test-target-mirror.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/tool-request.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/test-price-data.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/universe.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/portfolio.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/signal-fingerprint.repository.spec.ts"
  "src/prediction-runner/repositories/__tests__/source-subscription.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/alert.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/composite-score.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/assessment.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/debate.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/dimension-context.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/dimension.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/evaluation.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/learning.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/scope.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/subject.repository.spec.ts"
  "src/risk-runner/repositories/__tests__/source-subscription.repository.spec.ts"
  "src/prediction-runner/services/__tests__/missed-opportunity-detection.service.spec.ts"
  "src/prediction-runner/services/__tests__/miss-investigation.service.spec.ts"
  "src/prediction-runner/services/__tests__/missed-opportunity-analysis.service.spec.ts"
  "src/prediction-runner/services/__tests__/test-scenario-comparison.service.spec.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing $file"
    # Fix "data: unknown | null;" -> "data: unknown;"
    sed -i.bak 's/data: unknown | null;/data: unknown;/g' "$file"
    # Fix "data: unknown[] | null;" -> "data: unknown;"
    sed -i.bak 's/data: unknown\[\] | null;/data: unknown;/g' "$file"
    # Remove backup file
    rm -f "${file}.bak"
  fi
done

echo "Done fixing lint errors"

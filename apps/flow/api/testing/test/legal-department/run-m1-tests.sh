#!/bin/bash

# Legal Department AI M1 Test Runner
# Runs all M1 legal intelligence E2E tests

set -e

echo "=================================================="
echo "Legal Department AI - M1 Test Runner"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if services are running
echo -e "${BLUE}Checking services...${NC}"

if ! curl -s http://localhost:6100/health > /dev/null; then
    echo -e "${RED}✗ API server not running on localhost:6100${NC}"
    echo "  Start with: cd apps/api && npm run start:dev"
    exit 1
fi
echo -e "${GREEN}✓ API server running${NC}"

if ! curl -s http://localhost:6200/health > /dev/null; then
    echo -e "${RED}✗ LangGraph server not running on localhost:6200${NC}"
    echo "  Start with: cd apps/langgraph && npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ LangGraph server running${NC}"

echo ""
echo -e "${BLUE}Running M1 E2E Tests...${NC}"
echo ""

# Change to API directory
cd "$(dirname "$0")/../../../.."

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test suite
run_test() {
    local test_name=$1
    local test_file=$2

    echo -e "${YELLOW}Testing: ${test_name}${NC}"

    if npx jest --config apps/api/testing/test/jest-e2e.json "$test_file" --verbose; then
        echo -e "${GREEN}✓ ${test_name} PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ ${test_name} FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
}

# Run all M1 test suites
echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}Phase 1: Document Type Classification${NC}"
echo -e "${BLUE}=================================================${NC}"
run_test "Document Type Classification" "legal-department/document-type-classification.e2e-spec"

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}Phase 2: Section Detection${NC}"
echo -e "${BLUE}=================================================${NC}"
run_test "Section Detection" "legal-department/section-detection.e2e-spec"

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}Phase 3: Signature Detection${NC}"
echo -e "${BLUE}=================================================${NC}"
run_test "Signature Detection" "legal-department/signature-detection.e2e-spec"

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}Phase 4: Date Extraction${NC}"
echo -e "${BLUE}=================================================${NC}"
run_test "Date Extraction" "legal-department/date-extraction.e2e-spec"

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}Phase 5: Party Extraction${NC}"
echo -e "${BLUE}=================================================${NC}"
run_test "Party Extraction" "legal-department/party-extraction.e2e-spec"

echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}Phase 6: Full Pipeline Integration${NC}"
echo -e "${BLUE}=================================================${NC}"
run_test "Legal Metadata Pipeline" "legal-department/legal-metadata-pipeline.e2e-spec"

# Print summary
echo ""
echo -e "${BLUE}=================================================${NC}"
echo -e "${BLUE}M1 TEST SUMMARY${NC}"
echo -e "${BLUE}=================================================${NC}"
echo -e "Total Test Suites: ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
else
    echo -e "${GREEN}Failed: ${FAILED_TESTS}${NC}"
fi
echo ""

# Check if all passed
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}=================================================${NC}"
    echo -e "${GREEN}✓ ALL M1 TESTS PASSED!${NC}"
    echo -e "${GREEN}=================================================${NC}"
    echo ""
    echo -e "${GREEN}M1 Milestone Ready for Final Validation (Phase 8)${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run M1 demo script"
    echo "2. Verify all acceptance criteria manually"
    echo "3. Update documentation"
    echo "4. Tag M1 milestone"
    echo "5. Proceed to M2 (Contract Agent)"
    exit 0
else
    echo -e "${RED}=================================================${NC}"
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo -e "${RED}=================================================${NC}"
    echo ""
    echo "Review failed tests above and fix issues before proceeding."
    exit 1
fi

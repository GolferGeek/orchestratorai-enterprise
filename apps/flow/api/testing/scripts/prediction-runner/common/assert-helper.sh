#!/bin/bash
# =============================================================================
# Assert Helper - Common assertion functions for prediction runner tests
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Log a test section header
log_test() {
  echo ""
  echo -e "${BLUE}--- TEST: $1 ---${NC}"
}

# Log success
log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((TESTS_PASSED++))
}

# Log failure
log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((TESTS_FAILED++))
}

# Log skip
log_skip() {
  echo -e "${YELLOW}[SKIP]${NC} $1"
  ((TESTS_SKIPPED++))
}

# Log info
log_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

# Assert that a value is not empty
assert_not_empty() {
  local value="$1"
  local name="$2"

  if [ -n "$value" ] && [ "$value" != "null" ]; then
    log_success "$name is not empty"
    return 0
  else
    log_fail "$name is empty or null"
    return 1
  fi
}

# Assert that a value equals expected
assert_equals() {
  local actual="$1"
  local expected="$2"
  local name="$3"

  if [ "$actual" = "$expected" ]; then
    log_success "$name: $actual == $expected"
    return 0
  else
    log_fail "$name: expected '$expected', got '$actual'"
    return 1
  fi
}

# Assert that a value contains a substring
assert_contains() {
  local actual="$1"
  local substring="$2"
  local name="$3"

  if [[ "$actual" == *"$substring"* ]]; then
    log_success "$name contains '$substring'"
    return 0
  else
    log_fail "$name does not contain '$substring'"
    return 1
  fi
}

# Assert HTTP response code
assert_http_status() {
  local response="$1"
  local expected_status="$2"
  local name="${3:-HTTP request}"

  local actual_status
  actual_status=$(echo "$response" | tail -n1)

  if [ "$actual_status" = "$expected_status" ]; then
    log_success "$name returned $expected_status"
    return 0
  else
    log_fail "$name: expected status $expected_status, got $actual_status"
    return 1
  fi
}

# Assert JSON field exists and is not null
assert_json_field() {
  local json="$1"
  local field="$2"
  local name="${3:-JSON field}"

  local value
  value=$(echo "$json" | jq -r ".$field // empty")

  if [ -n "$value" ] && [ "$value" != "null" ]; then
    log_success "$name.$field exists: ${value:0:50}..."
    return 0
  else
    log_fail "$name.$field is missing or null"
    return 1
  fi
}

# Assert JSON array length
assert_json_array_length() {
  local json="$1"
  local field="$2"
  local min_length="$3"
  local name="${4:-JSON array}"

  local length
  length=$(echo "$json" | jq -r ".$field | length")

  if [ "$length" -ge "$min_length" ]; then
    log_success "$name.$field has $length items (>= $min_length)"
    return 0
  else
    log_fail "$name.$field has $length items (expected >= $min_length)"
    return 1
  fi
}

# Print test summary
print_summary() {
  echo ""
  echo -e "${BLUE}==============================================================================${NC}"
  echo -e "${BLUE} Test Summary${NC}"
  echo -e "${BLUE}==============================================================================${NC}"
  echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
  echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
  echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
  echo ""

  if [ "$TESTS_FAILED" -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    return 1
  else
    echo -e "${GREEN}All tests passed!${NC}"
    return 0
  fi
}

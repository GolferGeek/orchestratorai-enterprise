#!/bin/bash
# =============================================================================
# Auth Helper - Common authentication functions for prediction runner tests
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory for .env loading
get_project_root() {
  local SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
}

# Load environment variables from .env file
load_env() {
  local PROJECT_ROOT="$(get_project_root)"
  if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
  fi
}

# Validate required environment variables
validate_env() {
  if [ "$SUPABASE_SERVICE_ROLE_KEY" = "your-service-role-key" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}Error: SUPABASE_SERVICE_ROLE_KEY is not set${NC}"
    echo "Please set it in your .env file or export it before running this script"
    exit 1
  fi
}

# Authenticate with Supabase and return token
authenticate() {
  local EMAIL="${1:-$SUPABASE_TEST_USER}"
  local PASSWORD="${2:-$SUPABASE_TEST_PASSWORD}"
  local SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:6010}"
  local SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-your-anon-key}"

  AUTH_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
    -H "Content-Type: application/json" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -d "{
      \"email\": \"$EMAIL\",
      \"password\": \"$PASSWORD\"
    }")

  AUTH_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.access_token // empty')
  USER_ID=$(echo "$AUTH_RESPONSE" | jq -r '.user.id // empty')

  if [ -n "$AUTH_TOKEN" ] && [ "$AUTH_TOKEN" != "null" ]; then
    export AUTH_TOKEN
    export USER_ID
    return 0
  else
    echo -e "${RED}Authentication failed${NC}"
    echo "$AUTH_RESPONSE" | jq .
    return 1
  fi
}

# Get service client headers for direct DB access
get_service_headers() {
  echo "-H \"apikey: $SUPABASE_SERVICE_ROLE_KEY\" -H \"Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY\""
}

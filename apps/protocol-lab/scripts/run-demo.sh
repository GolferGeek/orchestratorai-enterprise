#!/bin/bash
# =============================================================================
# Agent Communication — Automated Demo & Test Scenario Runner
# =============================================================================
# Runs all test scenarios, generating real inter-agent traffic with
# security-rich messages that populate the Observability UI.
# Also covers Industry Fishbowl apps (SunStream port 4007, Ascentek port 4008).
#
# Prerequisites:
#   - Main API running on port 6100 (npm run dev:api)
#   - Agent Communication services running (npm run dev)
#   - For fishbowl tests: sunstream-app and ascentek-app also running
#
# Usage:
#   ./scripts/run-demo.sh              # Run all scenarios
#   ./scripts/run-demo.sh seed         # Quick seed only
#   ./scripts/run-demo.sh smoke        # Smoke test only
#   ./scripts/run-demo.sh scenario 3   # Run specific scenario
#   ./scripts/run-demo.sh fishbowl     # Run fishbowl tests only (SunStream + Ascentek)
#   ./scripts/run-demo.sh all          # Run everything (core + fishbowl)
# =============================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BASE="http://localhost:4000"
RH="http://localhost:4001"
MP="http://localhost:4002"
CF="http://localhost:4003"
SS="http://localhost:4007"
AS="http://localhost:4008"

PASS=0
FAIL=0
TOTAL=0

# ---------- Auth ----------
TOKEN=""

get_token() {
  echo -e "${BLUE}Authenticating with main API...${NC}"
  local resp
  resp=$(curl -s -X POST http://localhost:6100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"golfergeek@orchestratorai.io","password":"GolferGeek123!"}')
  TOKEN=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
  if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}Warning: Could not get JWT — main API may not be running. Continuing without auth.${NC}"
  else
    echo -e "${GREEN}Got JWT (${#TOKEN} chars)${NC}"
  fi
}

auth_header() {
  if [ -n "$TOKEN" ]; then
    echo "Authorization: Bearer $TOKEN"
  else
    echo "X-No-Auth: true"
  fi
}

# ---------- Helpers ----------
check() {
  local label="$1"
  local url="$2"
  local method="${3:-GET}"
  local body="$4"
  local expect="${5:-20[0-9]}"
  TOTAL=$((TOTAL + 1))

  local args=(-s -o /tmp/demo-resp.txt -w "%{http_code}" -H "Content-Type: application/json" -H "$(auth_header)")
  if [ "$method" = "POST" ]; then
    args+=(-X POST)
    [ -n "$body" ] && args+=(-d "$body")
  elif [ "$method" = "PUT" ]; then
    args+=(-X PUT)
    [ -n "$body" ] && args+=(-d "$body")
  fi

  local status
  status=$(curl "${args[@]}" "$url" 2>/dev/null)

  if [[ "$status" =~ ^${expect} ]]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $label (${status})"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $label (expected ${expect}, got ${status})"
    # Show first 200 chars of response on failure
    head -c 200 /tmp/demo-resp.txt 2>/dev/null
    echo ""
  fi
}

post_msg() {
  local id=$1 src=$2 tgt=$3 method=$4 status=$5 dur=$6 pay=$7 enc=$8 trust=$9 identity=${10}
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
  local nonce
  nonce=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "$(date +%s)-$(( RANDOM ))")

  curl -s -X POST "$BASE/api/messages" \
    -H "Content-Type: application/json" \
    -H "$(auth_header)" \
    -d "{
    \"id\": \"$id\",
    \"timestamp\": \"$ts\",
    \"source\": \"$src\",
    \"target\": \"$tgt\",
    \"method\": \"$method\",
    \"protocol\": {
      \"discovery\": \"well-known\",
      \"transport\": \"a2a-jsonrpc\",
      \"negotiation\": \"capability-card\",
      \"identity\": \"$identity\",
      \"payment\": \"$pay\",
      \"encryption\": \"$enc\",
      \"trust\": \"$trust\"
    },
    \"request\": {
      \"jsonrpc\": \"2.0\",
      \"id\": \"req-$id\",
      \"method\": \"$method\",
      \"params\": {\"topic\": \"agent communication\", \"security\": {
        \"nonce\": \"$nonce\",
        \"timestamp\": $(date +%s)000,
        \"senderId\": \"$src\",
        \"senderPublicKey\": \"MCowBQYDK2VwAyEAx7VpKm3nYb8QW2p0yR4K9HhJ5vTz6Lm8Fn1Gw2Xk3Y4=\",
        \"signature\": \"MEUCIQDx7VpKm3nYb8QW2p0yR4K9HhJ5vTz6Lm8Fn1Gw2Xk3Y4AIgRq8W5tN0mJ7kL2pS9vF6hD3wE1xC4yB0aR8uI5oK7nM=\",
        \"identityProvider\": \"$identity\"
      }}
    },
    \"response\": {\"jsonrpc\": \"2.0\", \"id\": \"req-$id\", \"result\": {\"content\": \"Analysis complete for $method\", \"metadata\": {\"encrypted\": $([ \"$enc\" != \"none\" ] && echo true || echo false), \"algorithm\": \"AES-256-GCM\"}}},
    \"timing\": {\"sentAt\": \"$ts\", \"durationMs\": $dur},
    \"payment\": {\"required\": $([ \"$pay\" != \"mock\" ] && echo true || echo false), \"amount\": 0.001, \"currency\": \"USDC\", \"status\": \"paid\"},
    \"status\": \"$status\"
  }" > /dev/null 2>&1
}

set_config() {
  curl -s -X PUT "$BASE/api/protocol/config" \
    -H "Content-Type: application/json" \
    -H "$(auth_header)" \
    -d "$1" > /dev/null 2>&1
}

# ---------- Scenarios ----------

scenario_seed() {
  echo -e "\n${CYAN}=== Quick Seed: Discover Agents + Populate Messages ===${NC}"

  echo -e "${BLUE}Discovering agents...${NC}"
  check "Discover ResearchHub"  "$BASE/api/agents/discover" POST '{"url":"http://localhost:4001"}' "20[0-9]"
  check "Discover MarketPulse"  "$BASE/api/agents/discover" POST '{"url":"http://localhost:4002"}' "20[0-9]"
  check "Discover ContentForge" "$BASE/api/agents/discover" POST '{"url":"http://localhost:4003"}' "20[0-9]"

  echo -e "${BLUE}Seeding 10 security-rich messages...${NC}"
  post_msg "demo-01" "research-hub"  "market-pulse"  "tasks/send"          "success" 142 "mock"           "none"       "allowlist"     "local-keys"
  post_msg "demo-02" "market-pulse"  "content-forge" "tasks/get"           "success" 287 "mock"           "envelope"   "reputation"    "local-keys"
  post_msg "demo-03" "content-forge" "research-hub"  "agent-card"          "success" 98  "x402-usdc"      "envelope"   "reputation"    "did"
  post_msg "demo-04" "research-hub"  "market-pulse"  "feeds/sync"          "error"   740 "mock"           "none"       "allowlist"     "local-keys"
  post_msg "demo-05" "market-pulse"  "content-forge" "drafts/generate"     "success" 412 "stripe-fiat"    "tls-mutual" "first-contact" "x509"
  post_msg "demo-06" "content-forge" "research-hub"  "topics/suggest"      "success" 156 "mock"           "envelope"   "reputation"    "oauth-jwt"
  post_msg "demo-07" "research-hub"  "content-forge" "analyze"             "success" 334 "x402-usdc"      "envelope"   "reputation"    "local-keys"
  post_msg "demo-08" "market-pulse"  "research-hub"  "signals/subscribe"   "success" 67  "lightning-l402"  "tls-mutual" "first-contact" "did"
  post_msg "demo-09" "content-forge" "market-pulse"  "trending/query"      "error"   890 "mock"           "none"       "allowlist"     "local-keys"
  post_msg "demo-10" "research-hub"  "content-forge" "narrative/generate"  "success" 523 "x402-usdc"      "envelope"   "reputation"    "local-keys"
  echo -e "${GREEN}Seeded 10 messages with diverse security profiles${NC}"
}

scenario_1() {
  echo -e "\n${CYAN}=== Scenario 1: Agent Discovery & Basic Communication ===${NC}"
  check "List agents"                "$BASE/api/agents"
  check "ResearchHub health"         "$RH/health"
  check "MarketPulse health"         "$MP/health"
  check "ContentForge health"        "$CF/health"
  check "ResearchHub agent card"     "$RH/.well-known/agent.json"
  check "MarketPulse agent card"     "$MP/.well-known/agent.json"
  check "ContentForge agent card"    "$CF/.well-known/agent.json"
  check "ResearchHub categories"     "$RH/api/categories"
  check "ResearchHub articles"       "$RH/api/articles"
  check "MarketPulse feeds"          "$MP/api/feeds"
  check "MarketPulse trending"       "$MP/api/trending"
  check "ContentForge drafts"        "$CF/api/drafts"
  check "ContentForge topics"        "$CF/api/topics"
}

scenario_2() {
  echo -e "\n${CYAN}=== Scenario 2: Protocol Layer Testing (All 12 Layers) ===${NC}"
  for layer in discovery transport negotiation identity payment wallet trust encryption resilience observability orchestration audit; do
    check "Test $layer" "$BASE/api/protocol/test/$layer" POST
  done
}

scenario_3() {
  echo -e "\n${CYAN}=== Scenario 3: Identity & Signing ===${NC}"
  for provider in local-keys did x509 oauth-jwt; do
    set_config "{\"identity\": \"$provider\"}"
    check "Identity: $provider" "$BASE/api/protocol/test/identity" POST
  done
  set_config '{"identity": "local-keys"}'
}

scenario_4() {
  echo -e "\n${CYAN}=== Scenario 4: Encryption Providers ===${NC}"
  for provider in envelope tls-mutual none; do
    set_config "{\"encryption\": \"$provider\"}"
    check "Encryption: $provider" "$BASE/api/protocol/test/encryption" POST
  done
  # Generate traffic with encryption active
  set_config '{"encryption": "envelope"}'
  check "Analyze with encryption" "$RH/agent/analyze" POST '{"topic":"encryption test","prompt":"test"}'
  set_config '{"encryption": "none"}'
}

scenario_5() {
  echo -e "\n${CYAN}=== Scenario 5: Payment Flows ===${NC}"
  for provider in mock x402-usdc stripe-fiat lightning-l402; do
    set_config "{\"payment\": \"$provider\"}"
    check "Payment: $provider" "$BASE/api/protocol/test/payment" POST
  done
  set_config '{"payment": "mock"}'
}

scenario_6() {
  echo -e "\n${CYAN}=== Scenario 6: Trust Establishment ===${NC}"
  for provider in first-contact reputation allowlist; do
    set_config "{\"trust\": \"$provider\"}"
    check "Trust: $provider" "$BASE/api/protocol/test/trust" POST
  done
  # Build trust with repeated successful calls
  echo -e "  ${BLUE}Building trust with 5 successful interactions...${NC}"
  for i in $(seq 1 5); do
    curl -s -H "$(auth_header)" "$RH/api/categories" > /dev/null 2>&1
  done
  check "Trust scores" "$BASE/api/trust"
  set_config '{"trust": "allowlist"}'
}

scenario_7() {
  echo -e "\n${CYAN}=== Scenario 7: Resilience — Circuit Breaker & Retry ===${NC}"
  for provider in circuit-breaker retry bulkhead; do
    set_config "{\"resilience\": \"$provider\"}"
    check "Resilience: $provider" "$BASE/api/protocol/test/resilience" POST
  done
  set_config '{"resilience": "retry"}'
}

scenario_8() {
  echo -e "\n${CYAN}=== Scenario 8: Transport Switching ===${NC}"
  for provider in http-rest a2a-jsonrpc websocket grpc mcp; do
    set_config "{\"transport\": \"$provider\"}"
    check "Transport: $provider" "$BASE/api/protocol/test/transport" POST
  done
  set_config '{"transport": "http-rest"}'
}

scenario_9() {
  echo -e "\n${CYAN}=== Scenario 9: Full Content Pipeline ===${NC}"
  # Set production-like stack
  set_config '{
    "discovery": "well-known",
    "transport": "a2a-jsonrpc",
    "negotiation": "capability-card",
    "identity": "local-keys",
    "payment": "mock",
    "wallet": "local-keypair",
    "trust": "reputation",
    "encryption": "envelope",
    "resilience": "circuit-breaker",
    "observability": "file-log",
    "orchestration": "pipeline",
    "audit": "hash-chain"
  }'

  check "ResearchHub analyze"   "$RH/agent/analyze"   POST '{"topic":"agent commerce","prompt":"Analyze autonomous agent transactions"}'
  check "ResearchHub signals"   "$RH/agent/signals"
  check "ResearchHub narrative" "$RH/agent/narrative/pragmatist"
  check "MarketPulse scan"      "$MP/agent/scan"      POST '{"query":"agent commerce payments"}'
  check "ContentForge draft"    "$CF/agent/draft"      POST '{"topic":"The Rise of Agent Commerce","sources":["research-hub","market-pulse"]}'
  check "ContentForge pipeline" "$CF/api/workflow/execute" POST '{"topic":"Agent-to-Agent Payments"}'
  check "Message log populated" "$BASE/api/messages?limit=5"
}

scenario_10() {
  echo -e "\n${CYAN}=== Scenario 10: Negotiation Protocols ===${NC}"
  for provider in capability-card acp auction; do
    set_config "{\"negotiation\": \"$provider\"}"
    check "Negotiation: $provider" "$BASE/api/protocol/test/negotiation" POST
  done
  set_config '{"negotiation": "capability-card"}'
}

scenario_12() {
  echo -e "\n${CYAN}=== Scenario 12: A2A Full Suite Task Lifecycle ===${NC}"
  check "SunStream Scenario 12" "$SS/scenarios/run/12" POST
  check "Ascentek Scenario 12" "$AS/scenarios/run/12" POST
}

scenario_13() {
  echo -e "\n${CYAN}=== Scenario 13: AGNTCY ACP Secure Exchange ===${NC}"
  check "SunStream Scenario 13" "$SS/scenarios/run/13" POST
  check "Ascentek Scenario 13" "$AS/scenarios/run/13" POST
}

scenario_14() {
  echo -e "\n${CYAN}=== Scenario 14: Commerce ACP Checkout Flow ===${NC}"
  check "SunStream Scenario 14" "$SS/scenarios/run/14" POST
  check "Ascentek Scenario 14" "$AS/scenarios/run/14" POST
}

scenario_15() {
  echo -e "\n${CYAN}=== Scenario 15: Mixed Suite A2A + Coinbase x402 ===${NC}"
  check "SunStream Scenario 15" "$SS/scenarios/run/15" POST
  check "Ascentek Scenario 15" "$AS/scenarios/run/15" POST
}

# ---------- Fishbowl Scenarios ----------

fishbowl_sunstream() {
  echo -e "\n${CYAN}=== SunStream App (Port 4007) — Farm Credit Fishbowl ===${NC}"

  echo -e "${BLUE}Infrastructure checks...${NC}"
  check "SunStream health"           "$SS/health"
  check "SunStream agent card"       "$SS/.well-known/agent.json"
  check "SunStream scenario list"    "$SS/scenarios/list"

  echo -e "${BLUE}Data endpoints...${NC}"
  check "SunStream service catalog"  "$SS/sunstream/services"
  check "SunStream associations"     "$SS/sunstream/associations"
  check "FCS loan applications"      "$SS/fcs/loans"
  check "FCS borrowers"              "$SS/fcs/borrowers"
  check "AgriBank ratings"           "$SS/agribank/ratings"
  check "AgriBank capital reqs"      "$SS/agribank/capital-requirements"

  echo -e "${BLUE}Running SunStream scenarios...${NC}"
  check "Scenario 1: Loan Compliance"         "$SS/scenarios/run/1" POST
  check "Scenario 2: Helpdesk Triage"         "$SS/scenarios/run/2" POST
  check "Scenario 3: Quarterly Oversight"     "$SS/scenarios/run/3" POST
  check "Scenario 4: Stress Test"             "$SS/scenarios/run/4" POST
  check "Scenario 5: New Association"         "$SS/scenarios/run/5" POST
  check "Scenario 12: A2A Full Suite"         "$SS/scenarios/run/12" POST
  check "Scenario 13: AGNTCY ACP"             "$SS/scenarios/run/13" POST
  check "Scenario 14: Commerce ACP"           "$SS/scenarios/run/14" POST
  check "Scenario 15: Mixed A2A + x402"       "$SS/scenarios/run/15" POST

  echo -e "${BLUE}Verifying pipeline traces in responses...${NC}"
  # Re-run scenario 1 and capture response to verify pipelineTrace is present
  TOTAL=$((TOTAL + 1))
  local resp
  resp=$(curl -s -X POST -H "Content-Type: application/json" -H "$(auth_header)" "$SS/scenarios/run/1" 2>/dev/null)
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'pipelineTrace' in d or 'pipeline_trace' in d or any('trace' in str(k).lower() for k in d.keys()), 'no trace'" 2>/dev/null; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} Scenario 1 response contains pipeline trace"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} Scenario 1 response missing pipelineTrace field"
  fi
}

fishbowl_ascentek() {
  echo -e "\n${CYAN}=== Ascentek App (Port 4008) — Manufacturing Fishbowl ===${NC}"

  echo -e "${BLUE}Infrastructure checks...${NC}"
  check "Ascentek health"           "$AS/health"
  check "Ascentek agent card"       "$AS/.well-known/agent.json"
  check "Ascentek scenario list"    "$AS/scenarios/list"

  echo -e "${BLUE}Data endpoints...${NC}"
  check "Ascentek formulations"     "$AS/ascentek/formulations"
  check "Ascentek specs"            "$AS/ascentek/specs"
  check "Ascentek partners"         "$AS/ascentek/partners"
  check "Lube-Tech inventory"       "$AS/lube-tech/inventory"
  check "Lube-Tech batches"         "$AS/lube-tech/batches"
  check "OEM purchase orders"       "$AS/oem/purchase-orders"
  check "OEM spec requirements"     "$AS/oem/spec-requirements"

  echo -e "${BLUE}Running Ascentek scenarios...${NC}"
  check "Scenario 6: PO Submit"             "$AS/scenarios/run/6"  POST
  check "Scenario 7: Spec Query"            "$AS/scenarios/run/7"  POST
  check "Scenario 8: Quality Hold"          "$AS/scenarios/run/8"  POST
  check "Scenario 9: Competitive Bid"       "$AS/scenarios/run/9"  POST
  check "Scenario 10: New OEM Onboarding"   "$AS/scenarios/run/10" POST
  check "Scenario 12: A2A Full Suite"       "$AS/scenarios/run/12" POST
  check "Scenario 13: AGNTCY ACP"           "$AS/scenarios/run/13" POST
  check "Scenario 14: Commerce ACP"         "$AS/scenarios/run/14" POST
  check "Scenario 15: Mixed A2A + x402"     "$AS/scenarios/run/15" POST

  echo -e "${BLUE}Verifying pipeline traces in responses...${NC}"
  TOTAL=$((TOTAL + 1))
  local resp
  resp=$(curl -s -X POST -H "Content-Type: application/json" -H "$(auth_header)" "$AS/scenarios/run/6" 2>/dev/null)
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'pipelineTrace' in d or 'pipeline_trace' in d or any('trace' in str(k).lower() for k in d.keys()), 'no trace'" 2>/dev/null; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} Scenario 6 response contains pipeline trace"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} Scenario 6 response missing pipelineTrace field"
  fi
}

fishbowl_cross_ecosystem() {
  echo -e "\n${CYAN}=== Cross-Ecosystem Scenario 11 ===${NC}"
  echo -e "${BLUE}Scenario 11: Quality complaint triggers Farm Credit compliance review${NC}"

  check "Scenario 11 via Ascentek (initiator)" "$AS/scenarios/run/11" POST
  check "Scenario 11 via SunStream (receiver)"  "$SS/scenarios/run/11" POST

  echo -e "${BLUE}Verifying cross-ecosystem pipeline trace...${NC}"
  TOTAL=$((TOTAL + 1))
  local resp
  resp=$(curl -s -X POST -H "Content-Type: application/json" -H "$(auth_header)" "$AS/scenarios/run/11" 2>/dev/null)
  if echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'pipelineTrace' in d or 'pipeline_trace' in d or any('trace' in str(k).lower() for k in d.keys()), 'no trace'" 2>/dev/null; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} Scenario 11 (Ascentek) response contains pipeline trace"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} Scenario 11 (Ascentek) response missing pipelineTrace field"
  fi
}

fishbowl_all() {
  fishbowl_sunstream
  fishbowl_ascentek
  fishbowl_cross_ecosystem
}

# ---------- Smoke Test ----------

smoke_test() {
  echo -e "\n${CYAN}=== Smoke Test ===${NC}"
  echo -e "${BLUE}Health checks...${NC}"
  check "Protocol API health"  "$BASE/health"
  check "ResearchHub health"   "$RH/health"
  check "MarketPulse health"   "$MP/health"
  check "ContentForge health"  "$CF/health"

  echo -e "${BLUE}Agent discovery...${NC}"
  check "Discover ResearchHub"  "$BASE/api/agents/discover" POST '{"url":"http://localhost:4001"}' "20[0-9]"
  check "Discover MarketPulse"  "$BASE/api/agents/discover" POST '{"url":"http://localhost:4002"}' "20[0-9]"
  check "Discover ContentForge" "$BASE/api/agents/discover" POST '{"url":"http://localhost:4003"}' "20[0-9]"

  echo -e "${BLUE}Protocol layers...${NC}"
  for layer in discovery transport negotiation identity payment wallet trust encryption resilience observability orchestration audit; do
    check "Test $layer" "$BASE/api/protocol/test/$layer" POST
  done

  echo -e "${BLUE}Inter-agent traffic...${NC}"
  check "ResearchHub analyze"  "$RH/agent/analyze"   POST '{"topic":"test","prompt":"test"}'
  check "MarketPulse scan"     "$MP/agent/scan"      POST '{"query":"AI agents"}'
  check "ContentForge draft"   "$CF/agent/draft"     POST '{"topic":"Test"}'

  echo -e "${BLUE}Message log...${NC}"
  check "Messages exist" "$BASE/api/messages?limit=1"
}

# ---------- Main ----------

print_summary() {
  echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  Results: ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  (${TOTAL} total)"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  if [ $FAIL -gt 0 ]; then
    exit 1
  fi
}

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Agent Communication — Demo & Test Runner${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

get_token

case "${1:-all}" in
  seed)
    scenario_seed
    ;;
  smoke)
    smoke_test
    ;;
  scenario)
    case "$2" in
      1)  scenario_1 ;;
      2)  scenario_2 ;;
      3)  scenario_3 ;;
      4)  scenario_4 ;;
      5)  scenario_5 ;;
      6)  scenario_6 ;;
      7)  scenario_7 ;;
      8)  scenario_8 ;;
      9)  scenario_9 ;;
      10) scenario_10 ;;
      12) scenario_12 ;;
      13) scenario_13 ;;
      14) scenario_14 ;;
      15) scenario_15 ;;
      *)  echo "Usage: $0 scenario {1-10|12|13|14|15}"; exit 1 ;;
    esac
    ;;
  fishbowl)
    fishbowl_all
    ;;
  all)
    scenario_seed
    scenario_1
    scenario_2
    scenario_3
    scenario_4
    scenario_5
    scenario_6
    scenario_7
    scenario_8
    scenario_9
    scenario_10
    scenario_12
    scenario_13
    scenario_14
    scenario_15
    fishbowl_all
    ;;
  *)
    echo "Usage: $0 [all|seed|smoke|scenario N|fishbowl]"
    exit 1
    ;;
esac

print_summary

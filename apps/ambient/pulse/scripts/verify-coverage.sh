#!/bin/bash
# =============================================================================
# Agent Communication — Protocol Provider Coverage Verification
# =============================================================================
# Runs all 11 fishbowl scenarios and verifies every one of the 31 protocol
# providers is exercised by at least one scenario.
#
# Usage:
#   ./scripts/verify-coverage.sh
#
# Exit codes:
#   0 — All 31 providers covered
#   1 — One or more providers have zero coverage
# =============================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SS="http://localhost:4007"
AS="http://localhost:4008"

# ---------- Auth ----------
TOKEN=""

get_token() {
  local resp
  resp=$(curl -s -X POST http://localhost:6100/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"golfergeek@orchestratorai.io","password":"GolferGeek123!"}')
  TOKEN=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
  if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}Warning: Could not get JWT — continuing without auth.${NC}"
  fi
}

auth_header() {
  if [ -n "$TOKEN" ]; then
    echo "Authorization: Bearer $TOKEN"
  else
    echo "X-No-Auth: true"
  fi
}

# ---------- The 31 providers ----------
ALL_PROVIDERS=(
  "well-known"
  "http-rest"
  "a2a-jsonrpc"
  "websocket"
  "grpc"
  "mcp"
  "capability-card"
  "acp"
  "auction"
  "local-keys"
  "did"
  "x509"
  "oauth-jwt"
  "mock"
  "stripe-fiat"
  "x402-usdc"
  "lightning-l402"
  "local-keypair"
  "coinbase-cdp"
  "allowlist"
  "reputation"
  "first-contact"
  "none"
  "envelope"
  "tls-mutual"
  "retry"
  "circuit-breaker"
  "bulkhead"
  "file-log"
  "opentelemetry"
  "pipeline"
  "hash-chain"
)

# ---------- Scenario definitions ----------
# Format: "SCENARIO_ID PORT LABEL"
SCENARIOS=(
  "1  4007  Loan Compliance (SunStream)"
  "2  4007  Helpdesk Triage (SunStream)"
  "3  4007  Quarterly Oversight (SunStream)"
  "4  4007  Stress Test (SunStream)"
  "5  4007  New Association Onboarding (SunStream)"
  "6  4008  PO Submit (Ascentek)"
  "7  4008  Spec Query (Ascentek)"
  "8  4008  Quality Hold (Ascentek)"
  "9  4008  Competitive Bid (Ascentek)"
  "10 4008  New OEM Onboarding (Ascentek)"
  "11 4008  Cross-Ecosystem Quality→Compliance (Ascentek)"
)

# ---------- Coverage state ----------
# Associate array: provider -> "scenario1 scenario2 ..."
declare -A PROVIDER_SCENARIOS

for p in "${ALL_PROVIDERS[@]}"; do
  PROVIDER_SCENARIOS["$p"]=""
done

# ---------- Extract providers from a response ----------
extract_providers() {
  local resp="$1"
  # Extract from pipelineTrace.steps[].provider and pipelineTrace.providersUsed[]
  # Also handle pipeline_trace, providers_used, and top-level providersUsed
  echo "$resp" | python3 - <<'PYEOF'
import sys
import json
import re

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

found = set()

def walk(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ('provider', 'providers', 'providersUsed', 'providers_used'):
                if isinstance(v, str):
                    found.add(v.strip().lower())
                elif isinstance(v, list):
                    for item in v:
                        if isinstance(item, str):
                            found.add(item.strip().lower())
                        elif isinstance(item, dict) and 'provider' in item:
                            found.add(str(item['provider']).strip().lower())
            walk(v)
    elif isinstance(obj, list):
        for item in obj:
            walk(item)

walk(data)

for p in sorted(found):
    if p:
        print(p)
PYEOF
}

# ---------- Run all scenarios ----------
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Agent Communication — Protocol Provider Coverage Verification${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

get_token

echo -e "${BLUE}Running all 11 scenarios and capturing pipeline traces...${NC}"
echo ""

declare -A SCENARIO_LABELS
declare -A SCENARIO_STATUS

for scenario_def in "${SCENARIOS[@]}"; do
  scenario_id=$(echo "$scenario_def" | awk '{print $1}')
  port=$(echo "$scenario_def" | awk '{print $2}')
  label=$(echo "$scenario_def" | awk '{$1=$2=""; print $0}' | sed 's/^ *//')

  SCENARIO_LABELS["$scenario_id"]="$label"

  printf "  Running scenario %-2s (%s)..." "$scenario_id" "$label"

  resp=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "$(auth_header)" \
    "http://localhost:${port}/scenarios/run/${scenario_id}" 2>/dev/null)

  http_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "$(auth_header)" \
    "http://localhost:${port}/scenarios/run/${scenario_id}" 2>/dev/null)

  if [[ "$http_status" =~ ^2 ]]; then
    SCENARIO_STATUS["$scenario_id"]="ok"
    printf " ${GREEN}%s${NC}\n" "$http_status"

    # Extract providers from response
    while IFS= read -r provider; do
      if [ -n "$provider" ] && [ -n "${PROVIDER_SCENARIOS[$provider]+x}" ]; then
        if [ -z "${PROVIDER_SCENARIOS[$provider]}" ]; then
          PROVIDER_SCENARIOS["$provider"]="$scenario_id"
        else
          PROVIDER_SCENARIOS["$provider"]="${PROVIDER_SCENARIOS[$provider]} $scenario_id"
        fi
      fi
    done < <(extract_providers "$resp")
  else
    SCENARIO_STATUS["$scenario_id"]="fail"
    printf " ${RED}%s${NC}\n" "$http_status"
  fi
done

# ---------- Coverage matrix ----------
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Protocol Provider Coverage Matrix${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
printf "  %-22s  %-8s  %s\n" "Provider" "Status" "Scenarios"
printf "  %-22s  %-8s  %s\n" "----------------------" "--------" "----------------------------"

COVERED=0
UNCOVERED=0
UNCOVERED_LIST=()

for p in "${ALL_PROVIDERS[@]}"; do
  scenarios="${PROVIDER_SCENARIOS[$p]}"
  if [ -n "$scenarios" ]; then
    COVERED=$((COVERED + 1))
    printf "  ${GREEN}%-22s${NC}  %-8s  %s\n" "$p" "COVERED" "$scenarios"
  else
    UNCOVERED=$((UNCOVERED + 1))
    UNCOVERED_LIST+=("$p")
    printf "  ${RED}%-22s${NC}  %-8s  %s\n" "$p" "MISSING" "(no scenario exercised this provider)"
  fi
done

# ---------- Summary ----------
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
TOTAL_PROVIDERS=${#ALL_PROVIDERS[@]}
echo -e "  Coverage: ${GREEN}${COVERED} covered${NC}  ${RED}${UNCOVERED} missing${NC}  (${TOTAL_PROVIDERS} total providers)"

# Scenario run status
SCENARIOS_OK=0
SCENARIOS_FAIL=0
for scenario_def in "${SCENARIOS[@]}"; do
  sid=$(echo "$scenario_def" | awk '{print $1}')
  if [ "${SCENARIO_STATUS[$sid]}" = "ok" ]; then
    SCENARIOS_OK=$((SCENARIOS_OK + 1))
  else
    SCENARIOS_FAIL=$((SCENARIOS_FAIL + 1))
  fi
done
echo -e "  Scenarios: ${GREEN}${SCENARIOS_OK} passed${NC}  ${RED}${SCENARIOS_FAIL} failed${NC}  (11 total)"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ${#UNCOVERED_LIST[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}FAIL: The following providers have zero coverage:${NC}"
  for p in "${UNCOVERED_LIST[@]}"; do
    echo -e "  ${RED}- $p${NC}"
  done
  echo ""
  echo -e "${YELLOW}Tip: Check that scenario pipeline traces include 'provider' fields for these layers.${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}PASS: All ${TOTAL_PROVIDERS} providers are exercised across the 11 scenarios.${NC}"
  exit 0
fi

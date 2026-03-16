#!/bin/bash
# =============================================================================
# Ingest Legal Documents into RAG Collections
# =============================================================================
# This script uploads legal documents to their respective RAG collections
# Requires: API server running, valid JWT token, Ollama for embeddings
# =============================================================================

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:6100}"
ORG_SLUG="legal"
DOCS_BASE="/Users/golfergeek/projects/orchAI/orchestrator-ai-v2/docs/RAG-filler/law"

# Check for JWT token - if not provided, try to login
if [ -z "$JWT_TOKEN" ]; then
    echo "No JWT_TOKEN provided, attempting login..."
    LOGIN_RESPONSE=$(curl -s "${API_BASE_URL}/auth/login" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"email": "golfergeek@orchestratorai.io", "password": "GolferGeek123!"}')

    JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$JWT_TOKEN" ]; then
        echo "Error: Failed to obtain JWT token"
        echo "Response: $LOGIN_RESPONSE"
        exit 1
    fi
    echo "Successfully obtained JWT token"
fi

# Check if API is running
if ! curl -s "${API_BASE_URL}/health" > /dev/null 2>&1; then
    echo "Error: API server is not reachable at ${API_BASE_URL}"
    exit 1
fi

echo "================================================"
echo "Legal Document Ingestion Script"
echo "================================================"
echo "API: ${API_BASE_URL}"
echo "Organization: ${ORG_SLUG}"
echo "Docs: ${DOCS_BASE}"
echo "================================================"

# Function to upload a document
upload_document() {
    local collection_id="$1"
    local file_path="$2"
    local filename=$(basename "$file_path")

    echo "Uploading: $filename to collection $collection_id"

    response=$(curl -s -w "\n%{http_code}" -X POST \
        "${API_BASE_URL}/api/rag/collections/${collection_id}/documents" \
        -H "Authorization: Bearer ${JWT_TOKEN}" \
        -H "x-organization-slug: ${ORG_SLUG}" \
        -F "file=@${file_path}")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -eq 201 ]; then
        echo "  ✓ Success: $filename"
    else
        echo "  ✗ Failed ($http_code): $filename"
        echo "  Response: $body"
    fi
}

# Get collection IDs from database
echo ""
echo "Fetching collection IDs..."
POLICIES_ID=$(docker exec supabase_db_api-dev psql -U postgres -d postgres -t -c "SELECT id FROM rag_data.rag_collections WHERE slug = 'law-firm-policies-attributed' AND organization_slug = 'legal';" | tr -d ' \n')
CONTRACTS_ID=$(docker exec supabase_db_api-dev psql -U postgres -d postgres -t -c "SELECT id FROM rag_data.rag_collections WHERE slug = 'law-contracts-hybrid' AND organization_slug = 'legal';" | tr -d ' \n')
LITIGATION_ID=$(docker exec supabase_db_api-dev psql -U postgres -d postgres -t -c "SELECT id FROM rag_data.rag_collections WHERE slug = 'law-litigation-cross-reference' AND organization_slug = 'legal';" | tr -d ' \n')
INTAKE_ID=$(docker exec supabase_db_api-dev psql -U postgres -d postgres -t -c "SELECT id FROM rag_data.rag_collections WHERE slug = 'law-client-intake-temporal' AND organization_slug = 'legal';" | tr -d ' \n')
ESTATE_ID=$(docker exec supabase_db_api-dev psql -U postgres -d postgres -t -c "SELECT id FROM rag_data.rag_collections WHERE slug = 'law-estate-planning-attributed' AND organization_slug = 'legal';" | tr -d ' \n')

echo "Collection IDs:"
echo "  Policies: $POLICIES_ID"
echo "  Contracts: $CONTRACTS_ID"
echo "  Litigation: $LITIGATION_ID"
echo "  Intake: $INTAKE_ID"
echo "  Estate: $ESTATE_ID"

# 1. Firm Policies (Attributed)
echo ""
echo "================================================"
echo "1. Uploading Firm Policies (Attributed)"
echo "================================================"
upload_document "$POLICIES_ID" "${DOCS_BASE}/firm-policies/billing/fee-agreement-policy.md"
upload_document "$POLICIES_ID" "${DOCS_BASE}/firm-policies/ethics/client-confidentiality-policy.md"
upload_document "$POLICIES_ID" "${DOCS_BASE}/firm-policies/ethics/conflict-of-interest-policy.md"
upload_document "$POLICIES_ID" "${DOCS_BASE}/firm-policies/operations/file-retention-policy.md"

# 2. Contracts (Hybrid)
echo ""
echo "================================================"
echo "2. Uploading Contracts (Hybrid)"
echo "================================================"
upload_document "$CONTRACTS_ID" "${DOCS_BASE}/contracts/templates/standard-nda-template.md"
upload_document "$CONTRACTS_ID" "${DOCS_BASE}/contracts/templates/engagement-letter-template.md"
upload_document "$CONTRACTS_ID" "${DOCS_BASE}/contracts/templates/master-services-agreement.md"
upload_document "$CONTRACTS_ID" "${DOCS_BASE}/contracts/clause-library/master-clause-library.md"

# 3. Litigation (Cross-Reference)
echo ""
echo "================================================"
echo "3. Uploading Litigation (Cross-Reference)"
echo "================================================"
upload_document "$LITIGATION_ID" "${DOCS_BASE}/litigation/motions/motion-to-dismiss-checklist.md"
upload_document "$LITIGATION_ID" "${DOCS_BASE}/litigation/discovery/written-discovery-checklist.md"
upload_document "$LITIGATION_ID" "${DOCS_BASE}/litigation/discovery/deposition-checklist.md"
upload_document "$LITIGATION_ID" "${DOCS_BASE}/litigation/trial-prep/trial-preparation-checklist.md"

# 4. Client Intake (Temporal - v1 and v2)
echo ""
echo "================================================"
echo "4. Uploading Client Intake (Temporal)"
echo "================================================"
upload_document "$INTAKE_ID" "${DOCS_BASE}/client-intake/checklists/personal-injury-intake-checklist.md"
upload_document "$INTAKE_ID" "${DOCS_BASE}/client-intake/checklists/personal-injury-intake-checklist-v2.md"

# 5. Estate Planning (Attributed)
echo ""
echo "================================================"
echo "5. Uploading Estate Planning (Attributed)"
echo "================================================"
upload_document "$ESTATE_ID" "${DOCS_BASE}/estate-planning/guides/basic-estate-plan-guide.md"

echo ""
echo "================================================"
echo "Document Ingestion Complete!"
echo "================================================"
echo "Total documents uploaded: 15"
echo ""
echo "Documents will be processed asynchronously."
echo "Check collection document counts in the UI or via API."

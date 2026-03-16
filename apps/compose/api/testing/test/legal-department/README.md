# Legal Department AI - Integration Tests

This directory contains comprehensive E2E integration tests for Legal Department AI Milestone 0.

## Test Files

### 1. Transport Types Verification (`transport-types.e2e-spec.ts`)
**What it tests:**
- Frontend → API → LangGraph routing (never direct Frontend → LangGraph)
- A2A protocol usage (POST /agent-to-agent/{orgSlug}/{agentSlug}/tasks)
- LangGraph is called via HTTP (not directly imported)
- Agent type 'langgraph' routes correctly
- CORS restrictions prevent browser from calling LangGraph directly
- Authentication required for A2A endpoint

**Key test cases:**
- ✅ Accept A2A POST request to correct endpoint
- ✅ Reject direct LangGraph calls from frontend (CORS)
- ✅ Require authentication for A2A endpoint
- ✅ Route agentType "langgraph" to LangGraph server via HTTP
- ✅ Verify legal-department agent registered with agentType "langgraph"
- ✅ Ensure API doesn't import LangGraph code directly
- ✅ Validate A2A protocol compliance
- ✅ Include ExecutionContext in all A2A requests
- ✅ Reject A2A requests without ExecutionContext

### 2. ExecutionContext Flow (`execution-context.e2e-spec.ts`)
**What it tests:**
- ExecutionContext flows from frontend through API to LangGraph
- Backend only mutates taskId/deliverableId/planId
- userId matches JWT (not from request body)
- Full context passed to all services

**Key test cases:**
- ✅ Accept ExecutionContext from frontend
- ✅ Extract userId from JWT, not request body
- ✅ Validate required ExecutionContext fields
- ✅ Generate taskId if not provided
- ✅ Generate conversationId if not provided
- ✅ Preserve existing conversationId across requests
- ✅ NOT mutate orgSlug, agentSlug, or agentType
- ✅ Pass full ExecutionContext to LangGraph
- ✅ Include provider and model in ExecutionContext
- ✅ Pass ExecutionContext to all services (document processing, observability, LLM)

### 3. Document Upload & Storage (`document-upload.e2e-spec.ts`)
**What it tests:**
- File upload to legal-documents bucket
- Storage path structure: `legal-documents/{orgSlug}/{conversationId}/{taskId}/{uuid}_{filename}`
- RLS policies (org-based access)
- File size limits (50MB)
- MIME type validation

**Key test cases:**
- ✅ Upload text file to legal-documents bucket
- ✅ Upload PDF file
- ✅ Upload multiple documents in one request
- ✅ Use correct storage path format
- ✅ Sanitize filenames in storage path (prevent path traversal)
- ✅ Accept files under 50MB
- ✅ Reject files over 50MB
- ✅ Accept PDF files (application/pdf)
- ✅ Accept DOCX files (application/vnd.openxmlformats-officedocument.wordprocessingml.document)
- ✅ Accept image files (PNG, JPG, JPEG, WEBP)
- ✅ Only allow access to documents in user organization (RLS)

### 4. Document Extraction (`document-extraction.e2e-spec.ts`)
**What it tests:**
- PDF text extraction (pdf-parse)
- DOCX text extraction (mammoth)
- Vision model extraction for images
- OCR fallback mechanism
- Extraction results stored correctly

**Key test cases:**
- ✅ Extract text from PDF files
- ✅ Handle PDFs without extractable text (scanned PDFs)
- ✅ Extract text from DOCX files
- ✅ Extract text from PNG images using vision model
- ✅ Extract text from JPEG images using vision model
- ✅ Fall back to OCR if vision model fails
- ✅ Handle OCR extraction for poor quality images
- ✅ Store extracted text in response
- ✅ Include extraction method in response (vision, ocr, or none)
- ✅ Handle corrupted files gracefully
- ✅ Handle unsupported MIME types

### 5. Full Flow Integration (`integration.e2e-spec.ts`)
**What it tests:**
- End-to-end test: Frontend upload → API processing → LangGraph execution → Response
- Echo node responds correctly
- Observability events emitted
- Database records created

**Key test cases:**
- ✅ Complete full flow: Frontend → API → LangGraph → Response
- ✅ Generate conversationId and taskId
- ✅ Complete full flow with document upload
- ✅ Handle multiple documents in one flow
- ✅ Receive response from echo node
- ✅ Echo back in converse mode
- ✅ Create conversation record in database
- ✅ Create task record in database
- ✅ Maintain conversation context across multiple turns
- ✅ Handle invalid agent slug gracefully
- ✅ Handle invalid org slug gracefully
- ✅ Handle LangGraph server unavailable gracefully

### 6. Observability (`observability.e2e-spec.ts`)
**What it tests:**
- Events emitted to API's /webhooks/status endpoint
- ExecutionContext included in all events
- Progress events during execution
- Database records created for observability
- SSE streaming of events

**Key test cases:**
- ✅ Accept status updates at /webhooks/status endpoint
- ✅ Reject status updates without ExecutionContext
- ✅ Reject status updates without taskId
- ✅ Include ExecutionContext in all observability events
- ✅ Validate ExecutionContext structure
- ✅ Extract userId, orgSlug, agentSlug from ExecutionContext
- ✅ Emit progress events during agent execution
- ✅ Track multiple progress steps
- ✅ Include step and progress percentage in events
- ✅ Create observability event records in database
- ✅ Store all ExecutionContext fields in database
- ✅ Store event metadata (message, progress, step)
- ✅ Emit events to observability SSE stream
- ✅ Handle concurrent event streams
- ✅ Track complete task lifecycle with observability events
- ✅ Integrate observability with A2A task execution
- ✅ Handle malformed observability events gracefully
- ✅ Handle invalid ExecutionContext gracefully

## Prerequisites

Before running these tests, ensure the following services are running:

1. **Supabase** - Local Supabase instance with:
   - All migrations applied
   - legal-documents bucket created
   - RLS policies configured
   - observability_events table created
   - demo-org organization seeded
   - legal-department agent seeded
   - Test user: demo.user@orchestratorai.io

2. **API Server** - Running on localhost:6100
   ```bash
   cd apps/api
   npm run start:dev
   ```

3. **LangGraph Server** - Running on localhost:6200
   ```bash
   cd apps/langgraph
   npm run start:dev
   ```

## Running the Tests

### Run all Legal Department tests
```bash
cd apps/api
npm run test:e2e -- legal-department
```

### Run specific test file
```bash
# Transport types
npm run test:e2e -- legal-department/transport-types

# ExecutionContext flow
npm run test:e2e -- legal-department/execution-context

# Document upload
npm run test:e2e -- legal-department/document-upload

# Document extraction
npm run test:e2e -- legal-department/document-extraction

# Integration
npm run test:e2e -- legal-department/integration

# Observability
npm run test:e2e -- legal-department/observability
```

### Run with verbose output
```bash
npm run test:e2e -- legal-department --verbose
```

### Run in watch mode
```bash
npm run test:e2e -- legal-department --watch
```

## Environment Variables

The tests use the following environment variables (with defaults):

```bash
# API Server
API_URL=http://localhost:6100

# LangGraph Server
LANGGRAPH_URL=http://localhost:6200

# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<your-anon-key>

# Test User
SUPABASE_TEST_USER=demo.user@orchestratorai.io
SUPABASE_TEST_PASSWORD=DemoUser123!
SUPABASE_TEST_USERID=<user-uuid>
```

## Test Architecture

### E2E Testing Principles (from e2e-testing-skill)

**CRITICAL: NO MOCKING in E2E tests**
- ✅ Use real services (API, LangGraph, Supabase)
- ✅ Use real database
- ✅ Use real authentication
- ✅ Test actual HTTP calls
- ❌ NO mocks for external services
- ❌ NO in-memory databases
- ❌ NO fake authentication

### ExecutionContext Flow (from execution-context-skill)

All tests validate ExecutionContext flow:
1. Frontend sends ExecutionContext in A2A request
2. API validates ExecutionContext structure
3. API extracts userId from JWT (ignores userId from request body)
4. API mutates only: taskId, conversationId, planId, deliverableId
5. API passes full ExecutionContext to LangGraph via HTTP
6. LangGraph uses ExecutionContext for all operations

### A2A Protocol Compliance (from transport-types-skill)

All tests validate A2A protocol:
1. Endpoint: `POST /agent-to-agent/{orgSlug}/{agentSlug}/tasks`
2. Request must include ExecutionContext
3. API calls LangGraph via HTTP (not direct imports)
4. Frontend never calls LangGraph directly
5. CORS prevents browser access to LangGraph

## Test Data

### Test Organization
- **Org Slug**: demo-org
- **Agent Slug**: legal-department
- **Agent Type**: langgraph

### Test User
- **Email**: demo.user@orchestratorai.io
- **Password**: DemoUser123!

### NIL_UUID
- Used for unset context fields: `00000000-0000-0000-0000-000000000000`

## Expected Test Results

All tests should pass when:
1. Services are running (API, LangGraph, Supabase)
2. Database is seeded with test data
3. legal-documents bucket exists with RLS policies
4. legal-department agent is registered

## Troubleshooting

### Tests fail with "Authentication failed"
- Ensure test user exists in Supabase
- Check SUPABASE_TEST_USER and SUPABASE_TEST_PASSWORD
- Verify Supabase is running on localhost:54321

### Tests fail with "Connection refused"
- Ensure API server is running on localhost:6100
- Ensure LangGraph server is running on localhost:6200
- Check API_URL and LANGGRAPH_URL environment variables

### Tests fail with "Agent not found"
- Ensure legal-department agent is seeded in database
- Check agent registration: agentSlug = "legal-department", agentType = "langgraph"
- Verify demo-org organization exists

### Tests fail with "Bucket not found"
- Create legal-documents bucket in Supabase
- Configure RLS policies for org-based access
- Verify bucket is accessible with service role

### TypeScript compilation errors
- These are expected for E2E tests (variable redeclarations across files)
- Jest runs the tests anyway at runtime
- Tests should still pass when executed

## Coverage

These tests provide comprehensive coverage of:
- ✅ Transport layer (Frontend → API → LangGraph)
- ✅ ExecutionContext flow and validation
- ✅ Document upload and storage
- ✅ Document extraction (PDF, DOCX, images)
- ✅ Full integration flow
- ✅ Observability and event tracking
- ✅ Authentication and authorization
- ✅ Error handling
- ✅ Database persistence

## Next Steps

After running these tests successfully:
1. Run all tests together to verify no conflicts
2. Add tests to CI/CD pipeline
3. Monitor test execution time and optimize if needed
4. Extend tests for additional Legal Department features (M1, M2, etc.)
5. Add performance tests for document processing
6. Add stress tests for concurrent uploads

## Related Documentation

- Architecture: See architecture skills (web-architecture-skill, api-architecture-skill, langgraph-architecture-skill)
- ExecutionContext: See execution-context-skill
- A2A Protocol: See transport-types-skill
- E2E Testing: See e2e-testing-skill
- Legal Department PRD: See plans/legal-department/

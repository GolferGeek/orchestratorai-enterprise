# Legal Department AI Agent

## Overview

The Legal Department AI agent provides legal assistance, document analysis, and compliance checking capabilities.

**Current Phase: M0 (Phase 3)** - Simple echo workflow to prove LLM integration works.

## Architecture

### Directory Structure

```
legal-department/
├── dto/
│   ├── index.ts
│   └── legal-department-request.dto.ts
├── nodes/
│   └── echo.node.ts
├── legal-department.controller.ts
├── legal-department.graph.ts
├── legal-department.module.ts
├── legal-department.service.ts
├── legal-department.state.ts
└── legal-department.types.ts
```

### Files

- **legal-department.state.ts** - State annotation with ExecutionContext, document support, and legal metadata placeholder
- **legal-department.types.ts** - Type definitions for legal documents and metadata
- **nodes/echo.node.ts** - M0 echo node that proves LLM integration works
- **legal-department.graph.ts** - LangGraph workflow definition with Postgres checkpointer
- **legal-department.service.ts** - NestJS service with dependency injection
- **legal-department.controller.ts** - HTTP endpoint handlers
- **legal-department.module.ts** - NestJS module configuration
- **dto/** - Request validation DTOs

## API Endpoints

### POST /legal-department/process

Start a new legal workflow.

**Request:**
```json
{
  "context": {
    "orgSlug": "org-123",
    "userId": "user-456",
    "conversationId": "conv-789",
    "taskId": "task-abc",
    "planId": "plan-def",
    "deliverableId": "deliv-ghi",
    "agentSlug": "legal-department",
    "agentType": "legal",
    "provider": "anthropic",
    "model": "claude-sonnet-4-5"
  },
  "userMessage": "Review this contract",
  "documents": [
    {
      "name": "contract.pdf",
      "content": "...",
      "type": "contract"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "taskId": "task-abc",
    "status": "completed",
    "userMessage": "Review this contract",
    "response": "I acknowledge your request...",
    "duration": 1234
  }
}
```

### GET /legal-department/status/:threadId

Get workflow status.

**Response:**
```json
{
  "success": true,
  "data": {
    "taskId": "task-abc",
    "status": "completed",
    "userMessage": "Review this contract",
    "response": "I acknowledge your request..."
  }
}
```

### GET /legal-department/history/:threadId

Get full state history.

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    { /* state snapshot 1 */ },
    { /* state snapshot 2 */ },
    { /* state snapshot 3 */ }
  ]
}
```

## Current Workflow (M0)

```
Start → Echo → Complete → End
```

1. **Start** - Initialize workflow, emit started event
2. **Echo** - Call LLM service to echo user message (proves integration)
3. **Complete** - Finalize, emit completion event
4. **End** - Workflow complete

## ExecutionContext Flow

The agent follows strict ExecutionContext patterns:

- ExecutionContext received from API request (never created)
- Stored in state annotation
- Passed whole to all nodes (never cherry-picked)
- Passed to LLM service calls
- Passed to observability events

## LLM Service Integration

The echo node calls the LLM service via HTTP:

```typescript
const response = await llmClient.callLLM({
  context: ctx, // Full ExecutionContext
  systemMessage: "You are a Legal Department AI assistant...",
  userMessage: state.userMessage,
  callerName: "legal-department",
  temperature: 0.7,
  maxTokens: 1000,
});
```

## Observability Events

The workflow emits observability events:

- **Started** - Workflow initiated
- **Progress** - Processing steps (echo, complete)
- **Completed** - Workflow succeeded
- **Failed** - Workflow failed

## State Persistence

State is persisted via Postgres checkpointer:

- Thread-based state management
- Automatic checkpointing at each node
- State history tracking
- Resume capability

## Future Phases

### Phase 4 - Document Analysis
- PDF/DOCX parsing
- Text extraction
- Structured data extraction

### Phase 5 - Legal Metadata Extraction
- Document classification
- Key terms identification
- Party identification
- Date extraction
- Clause analysis

### Phase 6 - Compliance Checking
- Regulatory requirement checking
- Jurisdiction-specific rules
- Compliance flags
- Risk assessment

### Phase 7 - Multi-Document Analysis
- Document comparison
- Conflict detection
- Change tracking
- Version analysis

## Testing

### M0 Test

```bash
curl -X POST http://localhost:6200/legal-department/process \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "orgSlug": "test-org",
      "userId": "test-user",
      "conversationId": "test-conv",
      "taskId": "test-task-123",
      "planId": "test-plan",
      "deliverableId": "test-deliv",
      "agentSlug": "legal-department",
      "agentType": "legal",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5"
    },
    "userMessage": "Hello, Legal Department AI!"
  }'
```

Expected: LLM response acknowledging the message in professional legal assistant tone.

## Dependencies

- **LLMHttpClientService** - Calls API's /llm/generate endpoint
- **ObservabilityService** - Sends events to API's /webhooks/status endpoint
- **PostgresCheckpointerService** - State persistence

## Notes

- M0 implementation is intentionally simple to prove integration
- Documents are accepted but not processed in M0
- Legal metadata is a placeholder for future phases
- All future document processing will be added in subsequent phases

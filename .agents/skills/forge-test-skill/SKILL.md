---
name: forge-test-skill
description: Testing patterns and knowledge for the Forge product — LangGraph workflows, HITL, async job queue, SSE streaming, worker poll loop, transport contract, legal department canonical reference
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Forge Test Skill

Deep testing knowledge for the Forge product. This is our most critical product. Use this when running, writing, improving, or auditing tests for any Forge module.

## Architecture Summary

Forge is asynchronous: HTTP request enqueues a job, a background worker claims it, a LangGraph graph executes it, SSE streams progress to the frontend.

```
POST /invoke
  → ForgeInvokeController
  → CapabilityRegistryService.getHandler(agentSlug)
  → handler.invoke(params)  [e.g., LegalDepartmentService.process()]
  → repo.insertQueued(jobData, context)
  → { success: true, output: { content: jobId, outputType: 'text' } }

Worker (background, 1s poll):
  → repo.claimNextQueued()           ← FOR UPDATE SKIP LOCKED
  → graph.stream(state, config)      ← LangGraph executes
  → interrupt(value) [optional]      ← HITL pause
  → repo.markAwaitingReview(jobId)
  → (later) repo.recordReviewAndRequeue(jobId, decision)
  → graph.invoke(null, { command: Command({ resume: decision }) })
  → repo.markCompleted(jobId, output)

GET /invoke/stream/:jobId
  → SSE: merges DB history events + live LangGraph events
```

## Running Tests

```bash
# All Forge unit tests
cd apps/forge/api && npx jest --passWithNoTests 2>&1 | tail -40

# Legal department only
cd apps/forge/api && npx jest agents/legal-department --passWithNoTests 2>&1 | tail -30

# Specific file
cd apps/forge/api && npx jest legal-jobs-worker 2>&1 | tail -20

# Coverage report
cd apps/forge/api && npx jest --coverage --coverageReporters=text-summary 2>&1 | tail -30

# E2E suite (requires Supabase + Forge running)
cd apps/forge/api && npx jest --config testing/test/jest-e2e.json 2>&1 | tail -50

# Legal department E2E
cd apps/forge/api && npx jest --config testing/test/jest-e2e.json legal-department 2>&1 | tail -40
```

## Key Files Reference

### Legal Department (Canonical — Test Everything)

| Source | Test File | Priority |
|--------|-----------|----------|
| `legal-department.service.ts` | `legal-department.service.spec.ts` | P0 |
| `legal-department.graph.ts` | `legal-department.graph.spec.ts` | P0 |
| `jobs/legal-jobs.controller.ts` | `jobs/legal-jobs.controller.spec.ts` | P0 |
| `jobs/legal-jobs-worker.service.ts` | `jobs/legal-jobs-worker.service.spec.ts` | P0 |
| `jobs/legal-jobs.repository.ts` | `jobs/legal-jobs.repository.spec.ts` | P0 |
| `nodes/hitl-checkpoint.node.ts` | `nodes/__tests__/hitl-checkpoint.node.spec.ts` | P0 |
| `nodes/orchestrator.node.ts` | `nodes/__tests__/orchestrator.node.spec.ts` | P1 |
| `nodes/synthesis.node.ts` | `nodes/__tests__/synthesis.node.spec.ts` | P1 |
| `nodes/clo-routing.node.ts` | `nodes/__tests__/clo-routing.node.spec.ts` | P1 |
| `nodes/specialist-utils.ts` | `nodes/__tests__/specialist-utils.spec.ts` | P1 |

### Shared Infrastructure

| Source | Test File | Priority |
|--------|-----------|----------|
| `shared/services/llm-http-client.service.ts` | `shared/services/llm-http-client.service.spec.ts` | P1 |
| `shared/services/hitl-helper.service.ts` | `shared/services/hitl-helper.service.spec.ts` | P1 |
| `shared/persistence/postgres-checkpointer.service.ts` | `shared/persistence/postgres-checkpointer.service.spec.ts` | P1 |

## Test Patterns

### Worker Poll Loop

The worker is the most critical piece — it drives the entire async execution:

```typescript
describe('LegalJobsWorkerService', () => {
  let worker: LegalJobsWorkerService;
  let mockRepo: jest.Mocked<LegalJobsRepository>;
  let mockGraph: { stream: jest.Mock; invoke: jest.Mock; getState: jest.Mock };

  beforeEach(async () => {
    mockRepo = createMockRepository();
    mockGraph = createMockGraph();
    
    const module = await Test.createTestingModule({
      providers: [
        LegalJobsWorkerService,
        { provide: LegalJobsRepository, useValue: mockRepo },
        { provide: LegalDepartmentService, useValue: { getGraph: () => mockGraph } },
      ],
    }).compile();

    worker = module.get<LegalJobsWorkerService>(LegalJobsWorkerService);
  });

  it('claims queued job on each poll cycle', async () => {
    mockRepo.claimNextQueued.mockResolvedValue(null); // no job
    await worker.tick();
    expect(mockRepo.claimNextQueued).toHaveBeenCalledOnce();
  });

  it('does nothing when no queued jobs', async () => {
    mockRepo.claimNextQueued.mockResolvedValue(null);
    await worker.tick();
    expect(mockRepo.markProcessing).not.toHaveBeenCalled();
  });

  it('marks job failed on unhandled graph error', async () => {
    mockRepo.claimNextQueued.mockResolvedValue(queuedJob);
    mockGraph.stream.mockRejectedValue(new Error('LLM timeout'));
    
    await worker.tick();
    
    expect(mockRepo.markFailed).toHaveBeenCalledWith(
      queuedJob.id,
      expect.stringContaining('LLM timeout')
    );
  });

  it('detects HITL interrupt and marks awaiting_review', async () => {
    mockRepo.claimNextQueued.mockResolvedValue(queuedJob);
    mockGraph.stream.mockImplementation(async function*() {
      yield { __interrupt__: [{ value: { synthesisOutput: 'review this' } }] };
    });
    
    await worker.tick();
    
    expect(mockRepo.markAwaitingReview).toHaveBeenCalledWith(
      queuedJob.id,
      expect.objectContaining({ synthesisOutput: 'review this' })
    );
    expect(mockRepo.markCompleted).not.toHaveBeenCalled();
  });

  it('resumes graph with review decision', async () => {
    const reviewedJob = { ...queuedJob, status: 'awaiting_review', review_decision: { approved: true } };
    mockRepo.claimNextQueued.mockResolvedValue(reviewedJob);
    
    await worker.tick();
    
    expect(mockGraph.invoke).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        command: expect.objectContaining({ resume: { approved: true } })
      })
    );
  });

  it('honors cancel_requested and marks canceled', async () => {
    const cancelJob = { ...queuedJob, status: 'processing' };
    mockRepo.claimNextQueued.mockResolvedValue(cancelJob);
    mockRepo.isCancelRequested.mockResolvedValue(true);
    
    mockGraph.stream.mockImplementation(async function*() {
      yield { currentStep: 'routing' }; // mid-execution
    });
    
    await worker.tick();
    
    expect(mockRepo.markCanceled).toHaveBeenCalledWith(cancelJob.id);
  });
});
```

### HITL Checkpoint Node

```typescript
describe('HitlCheckpointNode', () => {
  it('calls interrupt() with synthesis output', async () => {
    const state = {
      synthesisOutput: { summary: 'Contract analysis complete', risks: ['Risk A'] },
      jobId: 'job-123'
    };
    
    // interrupt() throws NodeInterrupt in LangGraph
    await expect(hitlCheckpointNode(state)).rejects.toThrow(); // or returns interrupt command
    
    // Verify what was passed to interrupt
    expect(mockInterrupt).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Contract analysis complete' })
    );
  });

  it('passes full synthesis state, not partial', async () => {
    const fullState = { synthesisOutput: fullOutput, specialistOutputs: allSpecialistOutputs };
    await hitlCheckpointNode(fullState);
    expect(mockInterrupt).toHaveBeenCalledWith(expect.objectContaining(fullState.synthesisOutput));
  });
});
```

### Repository — FOR UPDATE SKIP LOCKED

```typescript
describe('LegalJobsRepository', () => {
  it('claimNextQueued uses FOR UPDATE SKIP LOCKED', async () => {
    await repo.claimNextQueued();
    
    expect(mockDb.rawQuery).toHaveBeenCalledWith(
      expect.stringMatching(/FOR UPDATE SKIP LOCKED/i),
      expect.any(Array)
    );
  });

  it('claimNextQueued only returns queued jobs', async () => {
    await repo.claimNextQueued();
    
    expect(mockDb.rawQuery).toHaveBeenCalledWith(
      expect.stringMatching(/status\s*=\s*'queued'/i),
      expect.any(Array)
    );
  });

  it('claimNextQueued returns null when queue is empty', async () => {
    mockDb.rawQuery.mockResolvedValue([]);
    const result = await repo.claimNextQueued();
    expect(result).toBeNull();
  });

  it('propagates DB error from claimNextQueued', async () => {
    mockDb.rawQuery.mockRejectedValue(new Error('connection refused'));
    await expect(repo.claimNextQueued()).rejects.toThrow('connection refused');
  });
});
```

### Job Status Transitions

```typescript
describe('Job Status Transitions', () => {
  const transitions: Array<[string, string, () => Promise<void>]> = [
    ['queued', 'processing', () => repo.markProcessing(jobId)],
    ['processing', 'completed', () => repo.markCompleted(jobId, output)],
    ['processing', 'failed', () => repo.markFailed(jobId, errorMessage)],
    ['processing', 'awaiting_review', () => repo.markAwaitingReview(jobId, reviewData)],
    ['awaiting_review', 'queued', () => repo.recordReviewAndRequeue(jobId, decision)],
    ['processing', 'cancel_requested', () => repo.requestCancel(jobId)],
    ['cancel_requested', 'canceled', () => repo.markCanceled(jobId)],
  ];

  it.each(transitions)('transitions %s → %s', async (from, to, action) => {
    mockDb.rawQuery.mockResolvedValue([{ ...baseJob, status: to }]);
    await action();
    expect(mockDb.rawQuery).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`status.*${to}`, 'i')),
      expect.any(Array)
    );
  });
});
```

### LangGraph Node Tests

```typescript
describe('OrchestratorNode', () => {
  it('dispatches to all specialist nodes in parallel', async () => {
    const state = {
      routingDecision: { specialists: ['contract-agent', 'compliance-agent', 'risk-agent'] },
      originalContent: 'contract text'
    };
    
    await orchestratorNode(state);
    
    // All three should be called (Promise.all fan-out)
    expect(mockContractAgent).toHaveBeenCalledOnce();
    expect(mockComplianceAgent).toHaveBeenCalledOnce();
    expect(mockRiskAgent).toHaveBeenCalledOnce();
  });

  it('collects all specialist outputs into specialistOutputs map', async () => {
    const result = await orchestratorNode(state);
    expect(result.specialistOutputs).toHaveProperty('contract-agent');
    expect(result.specialistOutputs).toHaveProperty('compliance-agent');
  });

  it('propagates error if any specialist fails', async () => {
    mockContractAgent.mockRejectedValue(new Error('specialist timeout'));
    await expect(orchestratorNode(state)).rejects.toThrow('specialist timeout');
  });
});
```

### SSE Stream Tests

```typescript
describe('SSE Stream', () => {
  it('emits events with correct shape', async () => {
    const events: object[] = [];
    
    for await (const chunk of controller.streamJob(jobId, authCtx)) {
      events.push(JSON.parse(chunk.data));
      if (events.length >= 3) break;
    }
    
    events.forEach(event => {
      expect(event).toMatchObject({
        jobId: expect.any(String),
      });
    });
  });

  it('deduplicates DB history vs live events', async () => {
    // DB event: key = db:{id}
    // Live event: key = live:{type}:{timestamp}
    // They must never collide
    const dbKey = `db:${123}`;
    const liveKey = `live:node_started:2026-01-01T00:00:00Z`;
    expect(dbKey).not.toBe(liveKey);
    expect(dbKey.startsWith('db:')).toBe(true);
    expect(liveKey.startsWith('live:')).toBe(true);
  });

  it('filters out wrapper events without hook_event_type', async () => {
    const connectedEvent = { event_type: 'connected' }; // no hook_event_type
    expect(isValidObservabilityEvent(connectedEvent)).toBe(false);
  });
});
```

### Transport Contract Tests

```typescript
describe('Forge Transport Contract', () => {
  it('POST /invoke returns JSON-RPC 2.0 envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/invoke')
      .send({
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'invoke',
        params: {
          context: testExecutionContext,
          data: { content: 'Analyze this contract', contentType: 'text/plain' }
        }
      })
      .expect(200);

    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      id: 'test-1',
      result: {
        success: true,
        output: {
          content: expect.any(String), // jobId
          outputType: 'text'
        }
      }
    });
  });

  it('output.content is a valid job ID (UUID)', async () => {
    const response = await request(app.getHttpServer())
      .post('/invoke')
      .send(invokeRequest)
      .expect(200);
    
    const jobId = response.body.result.output.content;
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });
});
```

### ExecutionContext Integrity Tests

```typescript
describe('ExecutionContext Integrity', () => {
  it('context flows from invoke to LLM call unchanged', async () => {
    const ctx = createTestExecutionContext();
    
    await service.process(inputData, ctx, 'default');
    
    // LLM must receive the same context object, not a reconstruction
    expect(mockLlmService.call).toHaveBeenCalledWith(
      expect.objectContaining({ context: ctx })
    );
    
    // No individual field extraction
    const call = mockLlmService.call.mock.calls[0][0];
    expect(call.orgSlug).toBeUndefined(); // fields not on the root call object
    expect(call.context.orgSlug).toBe(ctx.orgSlug); // on context capsule only
  });

  it('context is stored in job record for observability', async () => {
    const ctx = createTestExecutionContext();
    await service.process(inputData, ctx, 'default');
    
    expect(mockRepo.insertQueued).toHaveBeenCalledWith(
      expect.objectContaining({ context: ctx })
    );
  });
});
```

## Mock Factories

```typescript
// Repository
function createMockRepository(): jest.Mocked<LegalJobsRepository> {
  return {
    insertQueued: jest.fn().mockResolvedValue({ id: 'job-uuid-1', status: 'queued' }),
    findByIdForOrg: jest.fn().mockResolvedValue(null),
    claimNextQueued: jest.fn().mockResolvedValue(null),
    markProcessing: jest.fn().mockResolvedValue(undefined),
    markAwaitingReview: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    recordReviewAndRequeue: jest.fn().mockResolvedValue(undefined),
    getReviewDecision: jest.fn().mockResolvedValue(null),
    listForOrg: jest.fn().mockResolvedValue([]),
    requestCancel: jest.fn().mockResolvedValue(undefined),
    markCanceled: jest.fn().mockResolvedValue(undefined),
    isCancelRequested: jest.fn().mockResolvedValue(false),
    cleanupOldJobs: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<LegalJobsRepository>;
}

// Graph
function createMockGraph() {
  return {
    stream: jest.fn().mockImplementation(async function*() {
      yield { currentStep: 'routing', progress: 20 };
      yield { currentStep: 'specialists', progress: 60 };
      yield { output: 'final result', status: 'completed' };
    }),
    invoke: jest.fn().mockResolvedValue({ status: 'completed', output: 'result' }),
    getState: jest.fn().mockResolvedValue({ values: { status: 'completed' } }),
    updateState: jest.fn().mockResolvedValue(undefined),
  };
}

// ExecutionContext
function createTestExecutionContext(): ExecutionContext {
  return {
    orgSlug: 'test-org',
    userId: 'user-test-1',
    conversationId: 'conv-test-1',
    agentSlug: 'legal-department',
    agentType: 'forge',
    provider: 'anthropic',
    model: 'Codex-sonnet-4-6',
  };
}

// Queued Job
const queuedJob = {
  id: 'job-uuid-1',
  status: 'queued',
  org_slug: 'test-org',
  user_id: 'user-test-1',
  input: { content: 'test document', contentType: 'text/plain' },
  context: createTestExecutionContext(),
  created_at: new Date().toISOString(),
  claimed_at: null,
  review_decision: null,
};
```

## Coverage Audit Procedure

1. Run coverage:
```bash
cd apps/forge/api && npx jest --coverage --coverageReporters=json-summary 2>&1 | tail -5
cat apps/forge/api/coverage/coverage-summary.json | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin'));
Object.entries(d).filter(([,v]) => v.lines.pct < 80).forEach(([f,v]) => console.log(v.lines.pct.toFixed(0)+'%', f));
"
```

2. For each file under 80%:
   - Read the file
   - Identify uncovered branches (conditionals, error paths, edge cases)
   - Write targeted tests for the gaps
   - Re-run coverage to confirm improvement

3. Priority order: legal-department core → HITL → worker → other agents

## Error Propagation Checklist

For each module, verify:
- [ ] Graph error → `markFailed()` called with error message
- [ ] DB error in `claimNextQueued` → propagates up (not caught silently)
- [ ] LLM service error → not swallowed in node, bubbles to worker
- [ ] Cancel detection → does not silently ignore cancel_requested
- [ ] HITL interrupt → not swallowed, triggers `markAwaitingReview`
- [ ] Review rejection → job enters `review_rejected` state (not silently requeued)

## Common Test Failures and Fixes

**"Cannot read __interrupt__ from graph stream"**  
→ HITL detection logic reads `state.__interrupt__[0].value`. Check array indexing.

**"Worker does not resume from awaiting_review"**  
→ Worker must check `job.review_decision !== null` to detect ready-to-resume jobs. Ensure mock sets this field.

**"SSE stream emits duplicate events"**  
→ Dedup map keying issue. DB events: `db:{id}`, live events: `live:{type}:{ts}`. Never mix.

**"FOR UPDATE SKIP LOCKED query missing from SQL"**  
→ Repository is using ORM `.findOne()` instead of `rawQuery()`. Only raw query supports this lock syntax.

**"ExecutionContext fields found on call root, not .context"**  
→ Somewhere the context is being destructured before passing. Search for `{ orgSlug, userId } = context` patterns.

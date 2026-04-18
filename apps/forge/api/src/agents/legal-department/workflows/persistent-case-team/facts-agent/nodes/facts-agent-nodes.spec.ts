import { createFactsStartNode } from './start.node';
import { createExtractEntitiesNode } from './extract-entities.node';
import { createExtractTimelineNode } from './extract-timeline.node';
import { createUpdateKnowledgeNode } from './update-knowledge.node';
import { createFactsCompleteNode } from './complete.node';
import type { FactsAgentState } from '../facts-agent.state';

// ── Fixtures ────────────────────────────────────────────────────────

const ctx = {
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'facts-conv-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'local',
  model: 'gemma3:4b',
};

const baseState: FactsAgentState = {
  executionContext: ctx,
  matterId: 'matter-1',
  documentId: 'doc-1',
  storagePath: 'matters/matter-1/doc-1.txt',
  documentContent: '',
  entities: [],
  timelineEntries: [],
  priorKnowledgeSummary: '',
  status: 'processing',
  error: undefined,
  startedAt: Date.now(),
};

function makeObservability() {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  };
}

function makeStorage(content = 'Hello legal world') {
  return {
    downloadOriginal: jest
      .fn()
      .mockResolvedValue({ data: Buffer.from(content) }),
  };
}

function makeLlmClient(responseText: string) {
  return {
    callLLM: jest
      .fn()
      .mockResolvedValue({ text: responseText, thinkingContent: undefined }),
  };
}

function makeMatterRepo() {
  return {
    upsertEntity: jest.fn().mockResolvedValue(undefined),
    insertTimelineEntry: jest.fn().mockResolvedValue(undefined),
    setFactsProcessed: jest.fn().mockResolvedValue(undefined),
  };
}

// ── start.node ──────────────────────────────────────────────────────

describe('createFactsStartNode', () => {
  it('downloads document and returns documentContent', async () => {
    const storage = makeStorage('contract text here');
    const observability = makeObservability();
    const node = createFactsStartNode(storage as never, observability as never);

    const result = await node(baseState);

    expect(result.documentContent).toBe('contract text here');
    expect(result.status).toBe('processing');
    expect(storage.downloadOriginal).toHaveBeenCalledWith(
      baseState.storagePath,
    );
  });

  it('returns failed status on storage error', async () => {
    const storage = {
      downloadOriginal: jest
        .fn()
        .mockRejectedValue(new Error('storage unavailable')),
    };
    const observability = makeObservability();
    const node = createFactsStartNode(storage as never, observability as never);

    const result = await node(baseState);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('storage unavailable');
    expect(observability.emitFailed).toHaveBeenCalled();
  });
});

// ── extract-entities.node ───────────────────────────────────────────

describe('createExtractEntitiesNode', () => {
  it('parses entity array and upserts to DB', async () => {
    const entities = [
      {
        entityType: 'person',
        name: 'Jane Doe',
        description: 'Plaintiff',
        role: 'plaintiff',
      },
      {
        entityType: 'organization',
        name: 'Acme Corp',
        description: 'Defendant',
        role: 'defendant',
      },
    ];
    const llmClient = makeLlmClient(JSON.stringify(entities));
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractEntitiesNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = {
      ...baseState,
      documentContent: 'contract between Jane Doe and Acme Corp',
    };
    const result = await node(state);

    expect(result.entities).toHaveLength(2);
    expect(matterRepo.upsertEntity).toHaveBeenCalledTimes(2);
  });

  it('filters out invalid entity types', async () => {
    const entities = [
      { entityType: 'person', name: 'Jane Doe', description: null, role: null },
      {
        entityType: 'invalid_type',
        name: 'Bad Entity',
        description: null,
        role: null,
      },
    ];
    const llmClient = makeLlmClient(JSON.stringify(entities));
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractEntitiesNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'document text' };
    const result = await node(state);

    expect(result.entities).toHaveLength(1);
    expect(matterRepo.upsertEntity).toHaveBeenCalledTimes(1);
  });

  it('retries on invalid JSON and returns failed if retry also fails', async () => {
    const llmClient = {
      callLLM: jest
        .fn()
        .mockResolvedValue({ text: 'not-json', thinkingContent: undefined }),
    };
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractEntitiesNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'document text' };
    const result = await node(state);

    expect(llmClient.callLLM).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('failed');
  });

  it('strips code fences before parsing', async () => {
    const entities = [
      {
        entityType: 'person',
        name: 'John',
        description: null,
        role: 'witness',
      },
    ];
    const llmClient = makeLlmClient(
      '```json\n' + JSON.stringify(entities) + '\n```',
    );
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractEntitiesNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'doc' };
    const result = await node(state);

    expect(result.entities).toHaveLength(1);
  });
});

// ── extract-timeline.node ───────────────────────────────────────────

describe('createExtractTimelineNode', () => {
  it('parses timeline array and inserts entries to DB', async () => {
    const entries = [
      {
        eventDateRaw: '2024-01-15',
        eventDate: '2024-01-15',
        eventType: 'filing',
        description: 'Complaint filed in district court',
        significance: 'critical',
        partiesInvolved: ['Jane Doe'],
      },
    ];
    const llmClient = makeLlmClient(JSON.stringify(entries));
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractTimelineNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = {
      ...baseState,
      documentContent: 'complaint filed January 15 2024',
    };
    const result = await node(state);

    expect(result.timelineEntries).toHaveLength(1);
    expect(matterRepo.insertTimelineEntry).toHaveBeenCalledTimes(1);
  });

  it('filters out entries with invalid event types', async () => {
    const entries = [
      {
        eventDateRaw: '2024-01-15',
        eventDate: '2024-01-15',
        eventType: 'invalid_type',
        description: 'Some event',
        significance: 'low',
        partiesInvolved: [],
      },
    ];
    const llmClient = makeLlmClient(JSON.stringify(entries));
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractTimelineNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'doc' };
    const result = await node(state);

    expect(result.timelineEntries).toHaveLength(0);
    expect(matterRepo.insertTimelineEntry).not.toHaveBeenCalled();
  });

  it('returns empty array on empty LLM response []', async () => {
    const llmClient = makeLlmClient('[]');
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractTimelineNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'no dates in this doc' };
    const result = await node(state);

    expect(result.timelineEntries).toHaveLength(0);
  });

  it('returns failed on parse failure after retry', async () => {
    const llmClient = {
      callLLM: jest
        .fn()
        .mockResolvedValue({ text: 'garbage', thinkingContent: undefined }),
    };
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractTimelineNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'doc' };
    const result = await node(state);

    expect(llmClient.callLLM).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('failed');
  });
});

// ── update-knowledge.node ───────────────────────────────────────────

describe('createUpdateKnowledgeNode', () => {
  it('builds priorKnowledgeSummary and marks document processed', async () => {
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createUpdateKnowledgeNode(
      observability as never,
      matterRepo as never,
    );

    const state: FactsAgentState = {
      ...baseState,
      entities: [
        {
          entityType: 'person',
          name: 'Alice',
          description: null,
          role: 'plaintiff',
        },
        {
          entityType: 'organization',
          name: 'Acme',
          description: null,
          role: 'defendant',
        },
      ],
    };
    const result = await node(state);

    expect(result.priorKnowledgeSummary).toContain('[person] Alice');
    expect(result.priorKnowledgeSummary).toContain('[organization] Acme');
    expect(matterRepo.setFactsProcessed).toHaveBeenCalledWith(
      'doc-1',
      'matter-1',
    );
  });

  it('caps priorKnowledgeSummary at 50 entities', async () => {
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createUpdateKnowledgeNode(
      observability as never,
      matterRepo as never,
    );

    const entities = Array.from({ length: 70 }, (_, i) => ({
      entityType: 'person',
      name: `Person ${i}`,
      description: null,
      role: null,
    }));
    const state: FactsAgentState = { ...baseState, entities };
    const result = await node(state);

    const lines = (result.priorKnowledgeSummary ?? '')
      .split('\n')
      .filter(Boolean);
    expect(lines).toHaveLength(50);
  });

  it('returns failed on DB error', async () => {
    const observability = makeObservability();
    const matterRepo = {
      setFactsProcessed: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const node = createUpdateKnowledgeNode(
      observability as never,
      matterRepo as never,
    );

    const result = await node(baseState);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('db down');
  });
});

// ── complete.node ───────────────────────────────────────────────────

describe('createFactsCompleteNode', () => {
  it('sets status to completed and emits completed event', async () => {
    const observability = makeObservability();
    const node = createFactsCompleteNode(observability as never);

    const state: FactsAgentState = {
      ...baseState,
      entities: [
        { entityType: 'person', name: 'X', description: null, role: null },
      ],
      timelineEntries: [
        {
          eventDateRaw: '2024-01-01',
          eventDate: '2024-01-01',
          eventType: 'filing',
          description: 'Event',
          significance: 'low',
          partiesInvolved: [],
        },
      ],
    };
    const result = await node(state);

    expect(result.status).toBe('completed');
    expect(observability.emitCompleted).toHaveBeenCalled();
  });
});

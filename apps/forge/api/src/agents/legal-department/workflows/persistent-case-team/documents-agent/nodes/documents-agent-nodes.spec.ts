import { createDocsStartNode } from './start.node';
import { createClassifyDocumentNode } from './classify-document.node';
import { createExtractMetadataNode } from './extract-metadata.node';
import { createUpdateIndexNode } from './update-index.node';
import { createDocsCompleteNode } from './complete.node';
import type { DocumentsAgentState } from '../documents-agent.state';

// ── Fixtures ────────────────────────────────────────────────────────

const ctx = {
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'docs-conv-1',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'local',
  model: 'gemma3:4b',
};

const baseState: DocumentsAgentState = {
  executionContext: ctx,
  matterId: 'matter-1',
  documentId: 'doc-1',
  storagePath: 'matters/matter-1/doc-1.txt',
  documentContent: '',
  documentClass: null,
  documentDate: null,
  summary: null,
  parties: [],
  keyTerms: [],
  additionalMetadata: {},
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
    updateDocumentClassification: jest.fn().mockResolvedValue(undefined),
    setDocsProcessed: jest.fn().mockResolvedValue(undefined),
  };
}

// ── start.node ──────────────────────────────────────────────────────

describe('createDocsStartNode', () => {
  it('downloads document and sets documentContent', async () => {
    const storage = makeStorage('contract text here');
    const observability = makeObservability();
    const node = createDocsStartNode(storage as never, observability as never);

    const result = await node(baseState);

    expect(result.documentContent).toBe('contract text here');
    expect(result.status).toBe('processing');
    expect(storage.downloadOriginal).toHaveBeenCalledWith(
      baseState.storagePath,
    );
  });

  it('returns failed on storage error', async () => {
    const storage = {
      downloadOriginal: jest
        .fn()
        .mockRejectedValue(new Error('storage unavailable')),
    };
    const observability = makeObservability();
    const node = createDocsStartNode(storage as never, observability as never);

    const result = await node(baseState);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('storage unavailable');
    expect(observability.emitFailed).toHaveBeenCalled();
  });
});

// ── classify-document.node ──────────────────────────────────────────

describe('createClassifyDocumentNode', () => {
  it('classifies document and calls updateDocumentClassification', async () => {
    const classification = {
      documentClass: 'contract',
      documentDate: '2024-01-15',
      summary: 'A service agreement between two parties.',
    };
    const llmClient = makeLlmClient(JSON.stringify(classification));
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createClassifyDocumentNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'SERVICE AGREEMENT...' };
    const result = await node(state);

    expect(result.documentClass).toBe('contract');
    expect(result.documentDate).toBe('2024-01-15');
    expect(result.summary).toBe('A service agreement between two parties.');
    expect(matterRepo.updateDocumentClassification).toHaveBeenCalledTimes(1);
  });

  it('normalizes unknown document class to "other"', async () => {
    const classification = {
      documentClass: 'unknown_type',
      documentDate: null,
      summary: 'Some document.',
    };
    const llmClient = makeLlmClient(JSON.stringify(classification));
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createClassifyDocumentNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'doc content' };
    const result = await node(state);

    expect(result.documentClass).toBe('other');
  });

  it('retries on parse failure and returns failed if retry also fails', async () => {
    const llmClient = {
      callLLM: jest
        .fn()
        .mockResolvedValue({ text: 'not-json', thinkingContent: undefined }),
    };
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createClassifyDocumentNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'doc content' };
    const result = await node(state);

    expect(llmClient.callLLM).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('failed');
  });

  it('strips code fences before parsing', async () => {
    const classification = {
      documentClass: 'court_filing',
      documentDate: '2024-03-10',
      summary: 'Motion to dismiss.',
    };
    const llmClient = makeLlmClient(
      '```json\n' + JSON.stringify(classification) + '\n```',
    );
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createClassifyDocumentNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'doc' };
    const result = await node(state);

    expect(result.documentClass).toBe('court_filing');
  });
});

// ── extract-metadata.node ───────────────────────────────────────────

describe('createExtractMetadataNode', () => {
  it('extracts parties and key terms and updates classification', async () => {
    const metadata = {
      parties: ['Jane Doe', 'Acme Corp'],
      keyTerms: ['indemnification', 'force majeure'],
      additionalMetadata: { caseNumber: '2024-CV-001' },
    };
    const llmClient = makeLlmClient(JSON.stringify(metadata));
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractMetadataNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = {
      ...baseState,
      documentContent: 'contract between Jane Doe and Acme Corp',
      documentClass: 'contract',
    };
    const result = await node(state);

    expect(result.parties).toEqual(['Jane Doe', 'Acme Corp']);
    expect(result.keyTerms).toEqual(['indemnification', 'force majeure']);
    expect(result.additionalMetadata).toEqual({ caseNumber: '2024-CV-001' });
    expect(matterRepo.updateDocumentClassification).toHaveBeenCalledTimes(1);
  });

  it('caps keyTerms at 15 items', async () => {
    const metadata = {
      parties: [],
      keyTerms: Array.from({ length: 20 }, (_, i) => `term-${i}`),
      additionalMetadata: {},
    };
    const llmClient = makeLlmClient(JSON.stringify(metadata));
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractMetadataNode(
      llmClient as never,
      observability as never,
      matterRepo as never,
    );

    const state = { ...baseState, documentContent: 'doc' };
    const result = await node(state);

    expect((result.keyTerms ?? []).length).toBeLessThanOrEqual(15);
  });

  it('returns failed on parse failure after retry', async () => {
    const llmClient = {
      callLLM: jest
        .fn()
        .mockResolvedValue({ text: 'garbage', thinkingContent: undefined }),
    };
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createExtractMetadataNode(
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

// ── update-index.node ───────────────────────────────────────────────

describe('createUpdateIndexNode', () => {
  it('calls setDocsProcessed with correct args', async () => {
    const observability = makeObservability();
    const matterRepo = makeMatterRepo();
    const node = createUpdateIndexNode(
      observability as never,
      matterRepo as never,
    );

    await node(baseState);

    expect(matterRepo.setDocsProcessed).toHaveBeenCalledWith(
      'doc-1',
      'matter-1',
    );
  });

  it('returns failed on DB error', async () => {
    const observability = makeObservability();
    const matterRepo = {
      setDocsProcessed: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const node = createUpdateIndexNode(
      observability as never,
      matterRepo as never,
    );

    const result = await node(baseState);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('db down');
  });
});

// ── complete.node ───────────────────────────────────────────────────

describe('createDocsCompleteNode', () => {
  it('sets status to completed and emits completed event', async () => {
    const observability = makeObservability();
    const node = createDocsCompleteNode(observability as never);

    const state: DocumentsAgentState = {
      ...baseState,
      documentClass: 'contract',
    };
    const result = await node(state);

    expect(result.status).toBe('completed');
    expect(observability.emitCompleted).toHaveBeenCalled();
  });
});

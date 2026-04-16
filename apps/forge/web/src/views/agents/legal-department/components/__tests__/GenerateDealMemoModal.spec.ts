/**
 * GenerateDealMemoModal — contract specs
 *
 * Mirrors the project's pattern for Ionic modals: instead of mounting the
 * Ionic shell (which needs a browser bootstrap), we exercise the HTTP
 * contract the modal sends to POST /legal-department/jobs/:id/generate-deal-memo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { legalJobsService } from '../../legalJobsService';

interface Form {
  dealStructure: 'stock-purchase' | 'asset-purchase' | 'merger';
  reviewerNotes: string;
}

function defaultForm(): Form {
  return { dealStructure: 'stock-purchase', reviewerNotes: '' };
}

function buildPayload(form: Form): {
  dealStructure: string;
  reviewerNotes?: string;
} {
  // Mirror the modal's submit logic — empty notes are dropped.
  return {
    dealStructure: form.dealStructure,
    ...(form.reviewerNotes.trim()
      ? { reviewerNotes: form.reviewerNotes.trim() }
      : {}),
  };
}

const TEST_CONTEXT = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: '',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

function mockFetchOnce(body: unknown, status = 202): void {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

describe('GenerateDealMemoModal default state', () => {
  it('initialises with stock-purchase selected', () => {
    expect(defaultForm().dealStructure).toBe('stock-purchase');
  });

  it('initialises reviewer notes empty', () => {
    expect(defaultForm().reviewerNotes).toBe('');
  });
});

describe('GenerateDealMemoModal payload shape', () => {
  it('includes the chosen dealStructure', () => {
    const f: Form = { ...defaultForm(), dealStructure: 'asset-purchase' };
    expect(buildPayload(f).dealStructure).toBe('asset-purchase');
  });

  it('omits reviewerNotes when empty', () => {
    const f: Form = { ...defaultForm(), reviewerNotes: '   ' };
    expect(buildPayload(f).reviewerNotes).toBeUndefined();
  });

  it('trims reviewerNotes when present', () => {
    const f: Form = {
      ...defaultForm(),
      reviewerNotes: '  Focus on IP carve-outs  ',
    };
    expect(buildPayload(f).reviewerNotes).toBe('Focus on IP carve-outs');
  });

  it.each(['stock-purchase', 'asset-purchase', 'merger'] as const)(
    'accepts deal structure %s',
    (s) => {
      const f: Form = { ...defaultForm(), dealStructure: s };
      expect(buildPayload(f).dealStructure).toBe(s);
    },
  );
});

describe('legalJobsService.generateDealMemo HTTP contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('POSTs to the correct generate-deal-memo endpoint', async () => {
    mockFetchOnce({
      jobId: 'memo-123',
      conversationId: 'conv-1',
      status: 'queued',
    });
    await legalJobsService.generateDealMemo('parent-room-1', TEST_CONTEXT, {
      dealStructure: 'stock-purchase',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/legal-department/jobs/parent-room-1/generate-deal-memo',
      ),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends context + dealStructure in the request body', async () => {
    mockFetchOnce({
      jobId: 'memo-1',
      conversationId: 'c-1',
      status: 'queued',
    });
    await legalJobsService.generateDealMemo('parent-1', TEST_CONTEXT, {
      dealStructure: 'merger',
      reviewerNotes: 'Watch the cap table',
    });
    const init = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as RequestInit;
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed.context).toEqual(TEST_CONTEXT);
    expect(parsed.dealStructure).toBe('merger');
    expect(parsed.reviewerNotes).toBe('Watch the cap table');
  });

  it('returns the queued jobId from the API response', async () => {
    mockFetchOnce({
      jobId: 'memo-abc',
      conversationId: 'conv-z',
      status: 'queued',
    });
    const res = await legalJobsService.generateDealMemo(
      'parent-x',
      TEST_CONTEXT,
      { dealStructure: 'stock-purchase' },
    );
    expect(res.jobId).toBe('memo-abc');
    expect(res.status).toBe('queued');
  });

  it('throws on non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      text: () => Promise.resolve('parent room not completed'),
    } as Response);
    await expect(
      legalJobsService.generateDealMemo('parent-x', TEST_CONTEXT, {
        dealStructure: 'stock-purchase',
      }),
    ).rejects.toThrow(/409 Conflict/);
  });
});

describe('legalJobsService.downloadDealMemo gating', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it.each(['md', 'docx'] as const)(
    'requests format=%s',
    async (format) => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        blob: () => Promise.resolve(new Blob([])),
      } as unknown as Response);
      await legalJobsService.downloadDealMemo('memo-1', 'legal', format);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`format=${format}`),
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    },
  );

  it('throws on 404 missing artifact', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('no docx artifact'),
    } as Response);
    await expect(
      legalJobsService.downloadDealMemo('memo-1', 'legal', 'docx'),
    ).rejects.toThrow(/404/);
  });
});

describe('legalJobsService.listDealMemosForRoom', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('passes parentJobId + jobType filters as query params', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ jobs: [] }),
      text: () => Promise.resolve(JSON.stringify({ jobs: [] })),
    } as Response);
    await legalJobsService.listDealMemosForRoom('legal', 'parent-room-9');
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as string;
    expect(url).toContain('jobType=deal-memo-generation');
    expect(url).toContain('parentJobId=parent-room-9');
    expect(url).toContain('orgSlug=legal');
  });
});

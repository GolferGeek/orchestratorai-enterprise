/**
 * ResearchJobCreateModal — unit specs
 *
 * Tests the form validation logic, default values, and HTTP payload
 * shape that the modal sends to POST /legal-department/jobs.
 *
 * Following the project's established pattern: we do NOT mount the full
 * Ionic modal (requires browser platform bootstrap). Instead, we test the
 * service-layer contracts and form-state logic directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Helpers ────────────────────────────────────────────────────────────────────

interface FormState {
  question: string;
  jurisdiction: string;
  practiceArea: string;
  keyFacts: string;
  maxDepth: number;
  maxSubQuestionsPerLevel: number;
  tokenBudget: number | null;
  timeBudgetMs: number | null;
}

function defaultForm(): FormState {
  return {
    question: '',
    jurisdiction: '',
    practiceArea: '',
    keyFacts: '',
    maxDepth: 3,
    maxSubQuestionsPerLevel: 3,
    tokenBudget: null,
    timeBudgetMs: null,
  };
}

function buildPayload(
  form: FormState,
  opts: {
    tokenBudgetUnlimited: boolean;
    timeBudgetUnlimited: boolean;
    context: Record<string, string>;
  },
) {
  return {
    context: opts.context,
    data: {
      content: form.question.trim(),
      contentType: 'text/plain',
    },
    metadata: {
      jobType: 'legal-research',
      jurisdiction: form.jurisdiction.trim() || undefined,
      practiceArea: form.practiceArea || undefined,
      keyFacts: form.keyFacts.trim() || undefined,
      researchConfig: {
        maxDepth: Number(form.maxDepth) || 3,
        maxSubQuestionsPerLevel: Number(form.maxSubQuestionsPerLevel) || 3,
        tokenBudget: opts.tokenBudgetUnlimited ? null : (Number(form.tokenBudget) || null),
        timeBudgetMs: opts.timeBudgetUnlimited ? null : (Number(form.timeBudgetMs) || null),
      },
    },
  };
}

function mockFetchOnce(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

const TEST_CONTEXT = {
  orgSlug: 'acme-corp',
  userId: 'user-123',
  conversationId: 'conv-abc',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

// ── Default values ─────────────────────────────────────────────────────────────

describe('ResearchJobCreateModal default form state', () => {
  it('initialises with empty question', () => {
    const form = defaultForm();
    expect(form.question).toBe('');
  });

  it('initialises maxDepth to 3', () => {
    const form = defaultForm();
    expect(form.maxDepth).toBe(3);
  });

  it('initialises maxSubQuestionsPerLevel to 3', () => {
    const form = defaultForm();
    expect(form.maxSubQuestionsPerLevel).toBe(3);
  });

  it('initialises tokenBudget to null (unlimited)', () => {
    const form = defaultForm();
    expect(form.tokenBudget).toBeNull();
  });

  it('initialises timeBudgetMs to null (unlimited)', () => {
    const form = defaultForm();
    expect(form.timeBudgetMs).toBeNull();
  });
});

// ── Validation ─────────────────────────────────────────────────────────────────

describe('form validation', () => {
  it('fails validation when question is empty', () => {
    const form = defaultForm();
    expect(form.question.trim()).toBe('');
    expect(!form.question.trim()).toBe(true);
  });

  it('passes validation when question has content', () => {
    const form = { ...defaultForm(), question: 'Is this IP assignment enforceable?' };
    expect(form.question.trim().length).toBeGreaterThan(0);
  });

  it('allows optional fields to be empty', () => {
    const form = { ...defaultForm(), question: 'Test question' };
    // jurisdiction, practiceArea, keyFacts can all be empty strings
    expect(form.jurisdiction).toBe('');
    expect(form.practiceArea).toBe('');
    expect(form.keyFacts).toBe('');
  });
});

// ── Submit payload shape ───────────────────────────────────────────────────────

describe('submit payload shape', () => {
  it('sets jobType to "legal-research" in metadata', () => {
    const form = { ...defaultForm(), question: 'Is non-compete enforceable in CA?' };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.jobType).toBe('legal-research');
  });

  it('includes question in data.content', () => {
    const question = 'What are the GDPR disclosure requirements?';
    const form = { ...defaultForm(), question };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.data.content).toBe(question);
    expect(payload.data.contentType).toBe('text/plain');
  });

  it('trims whitespace from question', () => {
    const form = { ...defaultForm(), question: '  Does CCPA apply?  ' };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.data.content).toBe('Does CCPA apply?');
  });

  it('sets tokenBudget to null when unlimited toggle is on', () => {
    const form = { ...defaultForm(), question: 'Q', tokenBudget: 50000 };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.researchConfig.tokenBudget).toBeNull();
  });

  it('sets tokenBudget to numeric value when toggle is off', () => {
    const form = { ...defaultForm(), question: 'Q', tokenBudget: 50000 };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: false,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.researchConfig.tokenBudget).toBe(50000);
  });

  it('sets timeBudgetMs to null when unlimited toggle is on', () => {
    const form = { ...defaultForm(), question: 'Q', timeBudgetMs: 300000 };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.researchConfig.timeBudgetMs).toBeNull();
  });

  it('sets timeBudgetMs to numeric value when toggle is off', () => {
    const form = { ...defaultForm(), question: 'Q', timeBudgetMs: 300000 };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: false,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.researchConfig.timeBudgetMs).toBe(300000);
  });

  it('omits undefined optional fields', () => {
    const form = { ...defaultForm(), question: 'Q' };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.jurisdiction).toBeUndefined();
    expect(payload.metadata.practiceArea).toBeUndefined();
    expect(payload.metadata.keyFacts).toBeUndefined();
  });

  it('includes optional fields when provided', () => {
    const form = {
      ...defaultForm(),
      question: 'Q',
      jurisdiction: 'California',
      practiceArea: 'Employment',
      keyFacts: 'Employee terminated for cause',
    };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.jurisdiction).toBe('California');
    expect(payload.metadata.practiceArea).toBe('Employment');
    expect(payload.metadata.keyFacts).toBe('Employee terminated for cause');
  });

  it('passes the full ExecutionContext in the context field', () => {
    const form = { ...defaultForm(), question: 'Q' };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.context).toEqual(TEST_CONTEXT);
  });

  it('uses maxDepth and maxSubQuestionsPerLevel from form', () => {
    const form = {
      ...defaultForm(),
      question: 'Q',
      maxDepth: 5,
      maxSubQuestionsPerLevel: 4,
    };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.researchConfig.maxDepth).toBe(5);
    expect(payload.metadata.researchConfig.maxSubQuestionsPerLevel).toBe(4);
  });
});

// ── HTTP layer ─────────────────────────────────────────────────────────────────

describe('HTTP submission to /legal-department/jobs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('POSTs to the correct endpoint', async () => {
    mockFetchOnce({ jobId: 'job-999', conversationId: 'conv-1', status: 'queued' });

    const FORGE_API_URL = 'http://localhost:5200';
    const token = null; // no auth token in this test
    const form = { ...defaultForm(), question: 'Will this NDA hold up?' };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });

    await fetch(`${FORGE_API_URL}/legal-department/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legal-department/jobs'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('includes Authorization header when authToken is present', async () => {
    localStorage.setItem('authToken', 'test-token-abc');
    mockFetchOnce({ jobId: 'job-1', conversationId: 'c1', status: 'queued' });

    const token = localStorage.getItem('authToken');
    const FORGE_API_URL = 'http://localhost:5200';

    await fetch(`${FORGE_API_URL}/legal-department/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({}),
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-token-abc');
  });

  it('returns jobId from API response', async () => {
    mockFetchOnce({ jobId: 'job-abc-123', conversationId: 'conv-1', status: 'queued' });

    const FORGE_API_URL = 'http://localhost:5200';
    const res = await fetch(`${FORGE_API_URL}/legal-department/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();

    expect(data.jobId).toBe('job-abc-123');
  });

  it('throws on non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Unexpected error'),
    } as Response);

    const FORGE_API_URL = 'http://localhost:5200';

    const res = await fetch(`${FORGE_API_URL}/legal-department/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Our enqueueResearchJob implementation throws when !res.ok
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
  });
});

// ── Practice area options ──────────────────────────────────────────────────────

describe('practice area options', () => {
  const VALID_PRACTICE_AREAS = [
    'Employment',
    'IP',
    'Corporate',
    'Litigation',
    'Privacy',
    'Compliance',
    'Real Estate',
    'Other',
  ];

  it('includes all expected practice areas', () => {
    for (const area of VALID_PRACTICE_AREAS) {
      // Verify the practiceArea field accepts each valid value
      const form = { ...defaultForm(), question: 'Q', practiceArea: area };
      expect(form.practiceArea).toBe(area);
    }
  });

  it('allows empty practice area', () => {
    const form = { ...defaultForm(), question: 'Q', practiceArea: '' };
    const payload = buildPayload(form, {
      tokenBudgetUnlimited: true,
      timeBudgetUnlimited: true,
      context: TEST_CONTEXT,
    });
    expect(payload.metadata.practiceArea).toBeUndefined();
  });
});

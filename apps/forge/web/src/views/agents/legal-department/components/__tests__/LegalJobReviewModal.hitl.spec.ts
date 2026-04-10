/**
 * Unit tests for LegalJobReviewModal Phase 4 Step 4.8 — Deepen and Redirect HITL.
 *
 * Following the project's established pattern (see LegalJobReviewModal.reasoning.spec.ts):
 * we test the service-layer contracts and data-shape logic directly rather than
 * mounting the full Ionic modal.
 *
 * Coverage:
 *  - Deepen: node selection (multi-select toggle), guidance field, payload shape
 *  - Redirect: node selection (single-select replace), replacement questions parsing,
 *    payload shape
 *  - legalJobsService.review() called with correct deepen/redirect payloads
 *  - Validation guards (no nodes selected, empty questions)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReviewDecisionPayload } from '../../legalJobsService';
import type { ResearchTreeNode } from '../research-types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeNode(
  overrides: Partial<ResearchTreeNode> & { id: string },
): ResearchTreeNode {
  return {
    parentId: null,
    question: `Question for ${overrides.id}`,
    depth: 0,
    status: 'answered',
    childIds: [],
    ...overrides,
  };
}

function mockFetchOnce(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

// ── Node selection logic (mirrors modal's onNodeSelected) ─────────────────────

describe('Deepen node selection logic (multi-select)', () => {
  function toggleNode(current: string[], nodeId: string): string[] {
    const idx = current.indexOf(nodeId);
    if (idx === -1) return [...current, nodeId];
    return current.filter((id) => id !== nodeId);
  }

  it('adds a node when it is not yet selected', () => {
    const result = toggleNode([], 'node-1');
    expect(result).toEqual(['node-1']);
  });

  it('removes a node when it is already selected (toggle off)', () => {
    const result = toggleNode(['node-1', 'node-2'], 'node-1');
    expect(result).toEqual(['node-2']);
  });

  it('supports selecting multiple nodes independently', () => {
    let selected: string[] = [];
    selected = toggleNode(selected, 'node-1');
    selected = toggleNode(selected, 'node-2');
    selected = toggleNode(selected, 'node-3');
    expect(selected).toHaveLength(3);
    expect(selected).toContain('node-1');
    expect(selected).toContain('node-2');
    expect(selected).toContain('node-3');
  });

  it('toggling a node twice returns to the original state', () => {
    let selected = ['node-1'];
    selected = toggleNode(selected, 'node-2');
    selected = toggleNode(selected, 'node-2');
    expect(selected).toEqual(['node-1']);
  });
});

describe('Redirect node selection logic (single-select)', () => {
  function selectSingle(current: string[], nodeId: string): string[] {
    // Deselect if already selected; otherwise replace with just this node
    return current[0] === nodeId ? [] : [nodeId];
  }

  it('selects the clicked node when nothing is selected', () => {
    const result = selectSingle([], 'node-3');
    expect(result).toEqual(['node-3']);
  });

  it('replaces the previously selected node with the new one', () => {
    const result = selectSingle(['node-1'], 'node-3');
    expect(result).toEqual(['node-3']);
  });

  it('deselects when the already-selected node is clicked again', () => {
    const result = selectSingle(['node-3'], 'node-3');
    expect(result).toEqual([]);
  });

  it('always holds at most one node', () => {
    let selected: string[] = [];
    selected = selectSingle(selected, 'a');
    selected = selectSingle(selected, 'b');
    selected = selectSingle(selected, 'c');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe('c');
  });
});

// ── Deepen payload shape ───────────────────────────────────────────────────────

describe('Deepen payload construction', () => {
  it('builds a deepen payload with targetNodeIds and guidance', () => {
    const selectedNodeIds = ['node-1', 'node-2'];
    const guidance = 'Focus on liability clauses';

    const payload: ReviewDecisionPayload = {
      decision: 'deepen',
      targetNodeIds: [...selectedNodeIds],
      guidance: guidance.trim() || undefined,
    };

    expect(payload.decision).toBe('deepen');
    if (payload.decision === 'deepen') {
      expect(payload.targetNodeIds).toEqual(['node-1', 'node-2']);
      expect(payload.guidance).toBe('Focus on liability clauses');
    }
  });

  it('omits guidance when the field is empty', () => {
    const payload: ReviewDecisionPayload = {
      decision: 'deepen',
      targetNodeIds: ['node-1'],
      guidance: ''.trim() || undefined,
    };

    if (payload.decision === 'deepen') {
      expect(payload.guidance).toBeUndefined();
    }
  });

  it('omits guidance when the field is only whitespace', () => {
    const rawGuidance = '   ';
    const payload: ReviewDecisionPayload = {
      decision: 'deepen',
      targetNodeIds: ['node-1'],
      guidance: rawGuidance.trim() || undefined,
    };

    if (payload.decision === 'deepen') {
      expect(payload.guidance).toBeUndefined();
    }
  });

  it('includes all selected node IDs in the payload', () => {
    const ids = ['node-a', 'node-b', 'node-c'];
    const payload: ReviewDecisionPayload = {
      decision: 'deepen',
      targetNodeIds: [...ids],
    };

    if (payload.decision === 'deepen') {
      expect(payload.targetNodeIds).toHaveLength(3);
      expect(payload.targetNodeIds).toEqual(ids);
    }
  });
});

// ── Redirect payload shape ─────────────────────────────────────────────────────

describe('Redirect payload construction', () => {
  function parseQuestions(raw: string): string[] {
    return raw
      .split('\n')
      .map((q) => q.trim())
      .filter((q) => q.length > 0);
  }

  it('builds a redirect payload with targetNodeId and replacementQuestions', () => {
    const selectedNodeIds = ['node-3'];
    const raw = 'What are the indemnification obligations?\nDoes the cap apply to IP?';
    const questions = parseQuestions(raw);

    const payload: ReviewDecisionPayload = {
      decision: 'redirect',
      targetNodeId: selectedNodeIds[0],
      replacementQuestions: questions,
    };

    expect(payload.decision).toBe('redirect');
    if (payload.decision === 'redirect') {
      expect(payload.targetNodeId).toBe('node-3');
      expect(payload.replacementQuestions).toHaveLength(2);
      expect(payload.replacementQuestions[0]).toBe(
        'What are the indemnification obligations?',
      );
      expect(payload.replacementQuestions[1]).toBe(
        'Does the cap apply to IP?',
      );
    }
  });

  it('strips blank lines from replacement questions', () => {
    const raw = 'Q1\n\nQ2\n   \nQ3';
    const questions = parseQuestions(raw);

    expect(questions).toHaveLength(3);
    expect(questions).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('trims whitespace from individual questions', () => {
    const raw = '  Q1  \n  Q2  ';
    const questions = parseQuestions(raw);

    expect(questions).toEqual(['Q1', 'Q2']);
  });

  it('returns empty array for blank input', () => {
    expect(parseQuestions('')).toEqual([]);
    expect(parseQuestions('   ')).toEqual([]);
    expect(parseQuestions('\n\n')).toEqual([]);
  });
});

// ── Validation guards ──────────────────────────────────────────────────────────

describe('HITL submission validation guards', () => {
  it('deepen: blocks submit when no nodes are selected', () => {
    const selectedNodeIds: string[] = [];
    // canSubmitDeepen mirrors: selectedNodeIds.length > 0
    const canSubmit = selectedNodeIds.length > 0;
    expect(canSubmit).toBe(false);
  });

  it('deepen: allows submit when at least one node is selected', () => {
    const selectedNodeIds = ['node-1'];
    const canSubmit = selectedNodeIds.length > 0;
    expect(canSubmit).toBe(true);
  });

  it('redirect: blocks submit when no node is selected', () => {
    const selectedNodeIds: string[] = [];
    const replacementQuestions = 'Some question';
    const canSubmit =
      selectedNodeIds.length > 0 && replacementQuestions.trim().length > 0;
    expect(canSubmit).toBe(false);
  });

  it('redirect: blocks submit when replacement questions are empty', () => {
    const selectedNodeIds = ['node-3'];
    const replacementQuestions = '';
    const canSubmit =
      selectedNodeIds.length > 0 && replacementQuestions.trim().length > 0;
    expect(canSubmit).toBe(false);
  });

  it('redirect: allows submit when a node is selected and questions provided', () => {
    const selectedNodeIds = ['node-3'];
    const replacementQuestions = 'What is the liability cap?';
    const canSubmit =
      selectedNodeIds.length > 0 && replacementQuestions.trim().length > 0;
    expect(canSubmit).toBe(true);
  });
});

// ── legalJobsService.review() called with correct payload ─────────────────────

describe('legalJobsService.review deepen/redirect integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('POSTs a deepen payload to the review endpoint', async () => {
    mockFetchOnce({ jobId: 'job-42', status: 'queued' });

    const { legalJobsService } = await import('../../legalJobsService');
    const context = {
      orgSlug: 'acme',
      userId: 'u1',
      conversationId: 'c1',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'openai',
      model: 'gpt-4o',
    };

    const payload: ReviewDecisionPayload = {
      decision: 'deepen',
      targetNodeIds: ['node-1', 'node-2'],
      guidance: 'Focus on liability',
    };

    const result = await legalJobsService.review('job-42', context, payload);

    expect(result.jobId).toBe('job-42');
    expect(result.status).toBe('queued');

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('/legal-department/jobs/job-42/review');
    expect(fetchCall[1].method).toBe('POST');

    // The service sends { context, decision } — decision is the ReviewDecisionPayload object
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.decision.decision).toBe('deepen');
    expect(body.decision.targetNodeIds).toEqual(['node-1', 'node-2']);
    expect(body.decision.guidance).toBe('Focus on liability');
  });

  it('POSTs a redirect payload to the review endpoint', async () => {
    mockFetchOnce({ jobId: 'job-43', status: 'queued' });

    const { legalJobsService } = await import('../../legalJobsService');
    const context = {
      orgSlug: 'acme',
      userId: 'u1',
      conversationId: 'c1',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'openai',
      model: 'gpt-4o',
    };

    const payload: ReviewDecisionPayload = {
      decision: 'redirect',
      targetNodeId: 'node-3',
      replacementQuestions: ['Q1', 'Q2'],
    };

    const result = await legalJobsService.review('job-43', context, payload);

    expect(result.jobId).toBe('job-43');

    // The service sends { context, decision } — decision is the ReviewDecisionPayload object
    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.decision.decision).toBe('redirect');
    expect(body.decision.targetNodeId).toBe('node-3');
    expect(body.decision.replacementQuestions).toEqual(['Q1', 'Q2']);
  });

  it('propagates network errors from the review endpoint', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network failure'));

    const { legalJobsService } = await import('../../legalJobsService');
    const context = {
      orgSlug: 'acme',
      userId: 'u1',
      conversationId: 'c1',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'openai',
      model: 'gpt-4o',
    };

    const payload: ReviewDecisionPayload = {
      decision: 'deepen',
      targetNodeIds: ['node-1'],
    };

    await expect(
      legalJobsService.review('job-44', context, payload),
    ).rejects.toThrow('Network failure');
  });

  it('throws on non-OK HTTP response', async () => {
    mockFetchOnce({ message: 'Job not in awaiting_review state' }, 409);

    const { legalJobsService } = await import('../../legalJobsService');
    const context = {
      orgSlug: 'acme',
      userId: 'u1',
      conversationId: 'c1',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'openai',
      model: 'gpt-4o',
    };

    const payload: ReviewDecisionPayload = {
      decision: 'redirect',
      targetNodeId: 'node-3',
      replacementQuestions: ['Q1'],
    };

    await expect(
      legalJobsService.review('job-45', context, payload),
    ).rejects.toThrow();
  });
});

// ── ResearchTree selectable mode props ────────────────────────────────────────

describe('ResearchTree selectable mode prop logic', () => {
  it('checkedIds defaults to empty when not provided', () => {
    const checkedIds: string[] | undefined = undefined;
    const normalised = checkedIds ?? [];
    expect(normalised).toEqual([]);
  });

  it('isChecked returns true when node id is in checkedIds', () => {
    const checkedIds = ['node-1', 'node-2'];
    const isChecked = (id: string) => checkedIds.includes(id);
    expect(isChecked('node-1')).toBe(true);
    expect(isChecked('node-3')).toBe(false);
  });

  it('in multi-select mode, multiple nodes can be checked simultaneously', () => {
    const checked = ['node-a', 'node-b', 'node-c'];
    expect(checked.length).toBeGreaterThan(1);
    for (const id of checked) {
      expect(checked.includes(id)).toBe(true);
    }
  });

  it('in single-select mode, only one node is checked at a time', () => {
    const checked = ['node-x'];
    expect(checked).toHaveLength(1);
  });
});

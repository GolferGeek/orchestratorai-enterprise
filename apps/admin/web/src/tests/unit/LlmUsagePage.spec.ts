/**
 * LlmUsagePage.spec.ts
 *
 * Unit tests for the LlmUsagePage component (Phase 7 additions):
 * - Filter state triggers listLlmUsage with correct params
 * - Row expansion calls getLlmUsageReasoning exactly once, shows loading then content
 * - thinkingContent renders in <pre>
 * - Collapse + expand a different row triggers a new fetch for that row
 * - Reasoning badge renders only when hasReasoning === true
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ─── Mock Ionic ─────────────────────────────────────────────────────────────
vi.mock('@ionic/vue', () => ({
  IonPage: { template: '<div><slot /></div>' },
  IonButton: { template: '<button><slot /></button>' },
  IonIcon: { template: '<span />' },
  IonSpinner: { template: '<span class="spinner" />' },
  toastController: {
    create: vi.fn().mockResolvedValue({ present: vi.fn().mockResolvedValue(undefined) }),
  },
}));

vi.mock('ionicons/icons', () => ({
  refreshOutline: 'refresh',
  analyticsOutline: 'analytics',
}));

// ─── Mock Pinia store ────────────────────────────────────────────────────────
vi.mock('@/stores/llm-analytics.store', () => ({
  useLlmAnalyticsStore: vi.fn(() => ({
    setLoading: vi.fn(),
    setError: vi.fn(),
    setUsageData: vi.fn(),
  })),
}));

// ─── Mock admin-api.service ──────────────────────────────────────────────────
const mockGetLlmUsage = vi.fn();
const mockListLlmUsage = vi.fn();
const mockGetLlmUsageReasoning = vi.fn();

vi.mock('@/services/admin-api.service', () => ({
  adminApiService: {
    getLlmUsage: mockGetLlmUsage,
    listLlmUsage: mockListLlmUsage,
    getLlmUsageReasoning: mockGetLlmUsageReasoning,
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<{
  id: string;
  orgSlug: string | null;
  agentName: string | null;
  workflowSlug: string | null;
  nodeName: string | null;
  providerName: string | null;
  modelName: string | null;
  conversationId: string | null;
  userId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  hasReasoning: boolean;
  thinkingDurationMs: number | null;
  thinkingTokenCount: number | null;
  createdAt: string;
}> = {}) {
  // Matches the admin API /admin/llm/usage/list row shape exactly —
  // field names (`providerName`, `modelName`, no `totalTokens`) must
  // stay in sync with LlmAnalyticsService.listUsage mapping.
  return {
    id: 'row-1',
    orgSlug: null,
    agentName: 'legal-department:synthesis',
    workflowSlug: 'legal-department',
    nodeName: 'synthesis',
    providerName: 'anthropic',
    modelName: 'claude-3-7-sonnet',
    conversationId: null,
    userId: null,
    inputTokens: 100,
    outputTokens: 200,
    hasReasoning: false,
    thinkingDurationMs: null,
    thinkingTokenCount: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function mountPage() {
  const { default: LlmUsagePage } = await import('@/views/admin/LlmUsagePage.vue');
  const wrapper = mount(LlmUsagePage, {
    global: {
      stubs: {
        IonPage: { template: '<div><slot /></div>' },
        IonButton: { template: '<button><slot /></button>' },
        IonIcon: { template: '<span />' },
        IonSpinner: { template: '<span class="spinner" />' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LlmUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: both calls return empty arrays
    mockGetLlmUsage.mockResolvedValue([]);
    mockListLlmUsage.mockResolvedValue([]);
    mockGetLlmUsageReasoning.mockResolvedValue({
      thinkingContent: 'test thinking content',
      thinkingDurationMs: 1234,
      thinkingTokenCount: 50,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Filter state triggers listLlmUsage with correct params ──────────────

  it('calls listLlmUsage on mount with default filters', async () => {
    await mountPage();
    expect(mockListLlmUsage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  it('triggers a new listLlmUsage call with orgSlug when org filter changes', async () => {
    vi.useFakeTimers();
    const wrapper = await mountPage();
    mockListLlmUsage.mockClear();

    const orgInput = wrapper.find('input[placeholder="Org slug"]');
    await orgInput.setValue('acme');
    await orgInput.trigger('input');

    vi.advanceTimersByTime(350);
    await flushPromises();

    expect(mockListLlmUsage).toHaveBeenCalledWith(
      expect.objectContaining({ orgSlug: 'acme', offset: 0 }),
    );
    vi.useRealTimers();
  });

  it('triggers a new listLlmUsage call with agentName when agent filter changes', async () => {
    vi.useFakeTimers();
    const wrapper = await mountPage();
    mockListLlmUsage.mockClear();

    const agentInput = wrapper.find('input[placeholder="Agent name"]');
    await agentInput.setValue('legal-agent');
    await agentInput.trigger('input');

    vi.advanceTimersByTime(350);
    await flushPromises();

    expect(mockListLlmUsage).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: 'legal-agent', offset: 0 }),
    );
    vi.useRealTimers();
  });

  it('triggers a new listLlmUsage call with hasReasoning=true when toggle set to "With Reasoning"', async () => {
    vi.useFakeTimers();
    const wrapper = await mountPage();
    mockListLlmUsage.mockClear();

    // Find the has-reasoning select (last select in the detail filter bar)
    const selects = wrapper.findAll('select');
    const reasoningSelect = selects[selects.length - 1];
    await reasoningSelect.setValue('true');
    await reasoningSelect.trigger('change');

    vi.advanceTimersByTime(350);
    await flushPromises();

    expect(mockListLlmUsage).toHaveBeenCalledWith(
      expect.objectContaining({ hasReasoning: true, offset: 0 }),
    );
    vi.useRealTimers();
  });

  it('does not include hasReasoning in params when toggle is "All"', async () => {
    vi.useFakeTimers();
    const wrapper = await mountPage();
    mockListLlmUsage.mockClear();

    const selects = wrapper.findAll('select');
    const reasoningSelect = selects[selects.length - 1];
    await reasoningSelect.setValue('');
    await reasoningSelect.trigger('change');

    vi.advanceTimersByTime(350);
    await flushPromises();

    const callArg = mockListLlmUsage.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('hasReasoning');
    vi.useRealTimers();
  });

  // ── 2. Expand triggers getLlmUsageReasoning exactly once, shows loading then content ──

  it('calls getLlmUsageReasoning once when expanding a row with hasReasoning', async () => {
    mockListLlmUsage.mockResolvedValue([makeRow({ id: 'row-1', hasReasoning: true })]);
    const wrapper = await mountPage();

    const expandBtn = wrapper.find('.expand-btn');
    expect(expandBtn.exists()).toBe(true);

    await expandBtn.trigger('click');
    // Loading state should show immediately
    expect(wrapper.find('.spinner').exists()).toBe(true);

    await flushPromises();

    expect(mockGetLlmUsageReasoning).toHaveBeenCalledTimes(1);
    expect(mockGetLlmUsageReasoning).toHaveBeenCalledWith('row-1');
  });

  it('shows loading spinner while fetching reasoning', async () => {
    // Make the reasoning call hang initially
    let resolveReasoning!: (v: unknown) => void;
    mockGetLlmUsageReasoning.mockReturnValue(new Promise((r) => { resolveReasoning = r; }));
    mockListLlmUsage.mockResolvedValue([makeRow({ id: 'row-1', hasReasoning: true })]);

    const wrapper = await mountPage();
    const expandBtn = wrapper.find('.expand-btn');
    await expandBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.reasoning-loading').exists()).toBe(true);
    expect(wrapper.find('.reasoning-pre').exists()).toBe(false);

    // Resolve the promise
    resolveReasoning({
      thinkingContent: 'hello world',
      thinkingDurationMs: 100,
      thinkingTokenCount: 10,
    });
    await flushPromises();

    expect(wrapper.find('.reasoning-loading').exists()).toBe(false);
    expect(wrapper.find('.reasoning-pre').exists()).toBe(true);
  });

  // ── 3. thinkingContent renders inside <pre> ───────────────────────────────

  it('renders thinkingContent inside .reasoning-pre', async () => {
    mockListLlmUsage.mockResolvedValue([makeRow({ id: 'row-1', hasReasoning: true })]);
    mockGetLlmUsageReasoning.mockResolvedValue({
      thinkingContent: 'This is the reasoning text',
      thinkingDurationMs: 500,
      thinkingTokenCount: 25,
    });

    const wrapper = await mountPage();
    await wrapper.find('.expand-btn').trigger('click');
    await flushPromises();

    const pre = wrapper.find('.reasoning-pre');
    expect(pre.exists()).toBe(true);
    expect(pre.text()).toBe('This is the reasoning text');
  });

  // ── 4. Collapse + expand different row fetches for new row ────────────────

  it('does not refetch when re-expanding the same row (uses cache)', async () => {
    mockListLlmUsage.mockResolvedValue([makeRow({ id: 'row-1', hasReasoning: true })]);
    const wrapper = await mountPage();
    const expandBtn = wrapper.find('.expand-btn');

    // Expand row-1
    await expandBtn.trigger('click');
    await flushPromises();
    expect(mockGetLlmUsageReasoning).toHaveBeenCalledTimes(1);

    // Collapse row-1
    await expandBtn.trigger('click');
    await flushPromises();

    // Re-expand row-1
    await expandBtn.trigger('click');
    await flushPromises();

    // Should still only have been called once (cache hit)
    expect(mockGetLlmUsageReasoning).toHaveBeenCalledTimes(1);
  });

  it('fetches reasoning for different row when switching expansion', async () => {
    mockListLlmUsage.mockResolvedValue([
      makeRow({ id: 'row-1', hasReasoning: true }),
      makeRow({ id: 'row-2', hasReasoning: true, agentName: 'other-agent' }),
    ]);
    const wrapper = await mountPage();
    const expandBtns = wrapper.findAll('.expand-btn');
    expect(expandBtns.length).toBe(2);

    // Expand row-1
    await expandBtns[0].trigger('click');
    await flushPromises();
    expect(mockGetLlmUsageReasoning).toHaveBeenCalledWith('row-1');

    // Expand row-2 (without collapsing row-1 first — toggles)
    await expandBtns[1].trigger('click');
    await flushPromises();
    expect(mockGetLlmUsageReasoning).toHaveBeenCalledWith('row-2');
    expect(mockGetLlmUsageReasoning).toHaveBeenCalledTimes(2);
  });

  // ── 5. Reasoning badge renders only when hasReasoning === true ─────────────

  it('renders reasoning badge only for rows where hasReasoning is true', async () => {
    mockListLlmUsage.mockResolvedValue([
      makeRow({ id: 'row-1', hasReasoning: true }),
      makeRow({ id: 'row-2', hasReasoning: false }),
    ]);
    const wrapper = await mountPage();

    const badges = wrapper.findAll('.badge-reasoning');
    expect(badges.length).toBe(1);
  });

  it('does not render reasoning badge when hasReasoning is false', async () => {
    mockListLlmUsage.mockResolvedValue([makeRow({ id: 'row-1', hasReasoning: false })]);
    const wrapper = await mountPage();

    expect(wrapper.find('.badge-reasoning').exists()).toBe(false);
  });

  it('does not render expand button for rows without hasReasoning', async () => {
    mockListLlmUsage.mockResolvedValue([makeRow({ id: 'row-1', hasReasoning: false })]);
    const wrapper = await mountPage();

    expect(wrapper.find('.expand-btn').exists()).toBe(false);
  });

  // ── Thinking duration column ───────────────────────────────────────────────

  it('shows thinking duration when thinkingDurationMs is present', async () => {
    mockListLlmUsage.mockResolvedValue([
      makeRow({ id: 'row-1', hasReasoning: true, thinkingDurationMs: 1234 }),
    ]);
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('1,234');
  });

  it('shows em-dash when thinkingDurationMs is null', async () => {
    mockListLlmUsage.mockResolvedValue([
      makeRow({ id: 'row-1', hasReasoning: false, thinkingDurationMs: null }),
    ]);
    const wrapper = await mountPage();

    // The em-dash for null thinkingDurationMs
    expect(wrapper.text()).toContain('—');
  });

  // ── Phase 8: Workflow + Node columns ─────────────────────────────────────

  it('renders Workflow and Node column headers in the detail table', async () => {
    const wrapper = await mountPage();
    const text = wrapper.text();
    expect(text).toContain('Workflow');
    expect(text).toContain('Node');
  });

  it('shows workflowSlug in the workflow column', async () => {
    mockListLlmUsage.mockResolvedValue([
      makeRow({ id: 'row-1', agentName: 'legal-department:litigation-agent', workflowSlug: 'legal-department', nodeName: 'litigation-agent' }),
    ]);
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('legal-department');
    expect(wrapper.text()).toContain('litigation-agent');
  });

  it('shows em-dash in the node column when nodeName is null', async () => {
    mockListLlmUsage.mockResolvedValue([
      makeRow({ id: 'row-1', agentName: 'data-analyst', workflowSlug: 'data-analyst', nodeName: null }),
    ]);
    const wrapper = await mountPage();

    // node column shows —
    const nodeCells = wrapper.findAll('.node-cell');
    expect(nodeCells.length).toBeGreaterThan(0);
    expect(nodeCells[0].text()).toBe('—');
  });

  it('sets agentName as the title tooltip on the workflow badge', async () => {
    const rawName = 'legal-department:litigation-agent';
    mockListLlmUsage.mockResolvedValue([
      makeRow({ id: 'row-1', agentName: rawName, workflowSlug: 'legal-department', nodeName: 'litigation-agent' }),
    ]);
    const wrapper = await mountPage();

    const badge = wrapper.find('.badge-product[title]');
    expect(badge.attributes('title')).toBe(rawName);
  });
});

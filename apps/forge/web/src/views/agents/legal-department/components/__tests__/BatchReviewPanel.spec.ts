import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import BatchReviewPanel from '../BatchReviewPanel.vue';
import * as legalJobsServiceModule from '../../legalJobsService';

// Stub Ionic + Ionicons
vi.mock('@ionic/vue', () => ({
  IonButton: { template: '<button><slot /></button>' },
  IonIcon: { template: '<span />' },
}));
vi.mock('ionicons/icons', () => ({
  chevronDownOutline: 'chevron-down',
  chevronForwardOutline: 'chevron-forward',
}));

const mockContext = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: 'conv-1',
  agentSlug: 'legal-department',
  agentType: 'forge',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const mockDocumentIndex = [
  { documentId: 'doc-1', name: 'contract.txt', documentType: 'contract' },
  { documentId: 'doc-2', name: 'email.txt', documentType: 'email' },
  { documentId: 'doc-3', name: 'memo.txt', documentType: 'memo' },
];

const mockCodings: Record<string, { relevance: { classification: string }; privilege: { classification: string }; issueTags?: Array<{ tagId: string; confidence?: number }>; hotDocument?: boolean }> = {
  'doc-1': {
    relevance: { classification: 'relevant', confidence: 0.95, reasoning: 'Matches key criteria' } as never,
    privilege: { classification: 'potentially_privileged', confidence: 0.9, reasoning: 'Below threshold' } as never,
    issueTags: [{ tagId: 'T1', confidence: 0.8 }],
    hotDocument: false,
  },
  'doc-2': {
    relevance: { classification: 'potentially_relevant', confidence: 0.6, reasoning: 'Partially matches' } as never,
    privilege: { classification: 'privileged', confidence: 0.99, reasoning: 'Attorney communication' } as never,
    issueTags: [],
    hotDocument: false,
  },
  'doc-3': {
    relevance: { classification: 'not_relevant', confidence: 0.95, reasoning: 'No match' } as never,
    privilege: { classification: 'not_privileged', confidence: 0.99, reasoning: 'No privilege' } as never,
    issueTags: [],
    hotDocument: false,
  },
};

const privilegeBatch = {
  batchId: 'batch-priv',
  batchType: 'privilege' as const,
  documentIds: ['doc-1', 'doc-2', 'doc-3'],
  status: 'pending',
};

const relevanceBatch = {
  batchId: 'batch-rel',
  batchType: 'low_confidence_relevance' as const,
  documentIds: ['doc-2'],
  status: 'pending',
};

function mountPanel(batch: { batchId: string; batchType: 'privilege' | 'low_confidence_relevance' | 'hot_documents' | 'sample'; documentIds: string[]; status: string } = privilegeBatch) {
  return mount(BatchReviewPanel, {
    props: {
      batch,
      documentCodings: mockCodings,
      documentIndex: mockDocumentIndex,
      jobId: 'job-1',
      context: mockContext,
    },
  });
}

describe('BatchReviewPanel', () => {
  describe('privilege batch', () => {
    it('shows privilege badge', () => {
      const wrapper = mountPanel(privilegeBatch);
      expect(wrapper.text()).toContain('Privilege Review');
    });

    it('disables Approve Remaining for privilege batch', () => {
      const wrapper = mountPanel(privilegeBatch);
      const approveRemainingBtn = wrapper.findAll('button').find(b =>
        b.text().includes('Approve Remaining'),
      );
      expect(approveRemainingBtn?.attributes('disabled')).toBeDefined();
    });

    it('shows privilege notice', () => {
      const wrapper = mountPanel(privilegeBatch);
      expect(wrapper.text()).toContain('Privilege batch');
    });

    it('shows all document names', () => {
      const wrapper = mountPanel(privilegeBatch);
      expect(wrapper.text()).toContain('contract.txt');
      expect(wrapper.text()).toContain('email.txt');
      expect(wrapper.text()).toContain('memo.txt');
    });

    it('lists all 3 docs as remaining initially', () => {
      const wrapper = mountPanel(privilegeBatch);
      expect(wrapper.text()).toContain('Remaining: 3');
    });
  });

  describe('non-privilege batch', () => {
    it('does not disable Approve Remaining for relevance batch', () => {
      const wrapper = mountPanel(relevanceBatch);
      const approveRemainingBtn = wrapper.findAll('button').find(b =>
        b.text().includes('Approve Remaining'),
      );
      expect(approveRemainingBtn?.attributes('disabled')).toBeUndefined();
    });

    it('shows low-confidence relevance label', () => {
      const wrapper = mountPanel(relevanceBatch);
      expect(wrapper.text()).toContain('Low-Confidence Relevance');
    });
  });

  describe('submit', () => {
    beforeEach(() => {
      vi.spyOn(legalJobsServiceModule.legalJobsService, 'review').mockResolvedValue({
        jobId: 'job-1',
        status: 'processing',
      });
    });

    it('submits batch_review decision with correct batchId', async () => {
      const wrapper = mountPanel(relevanceBatch);
      // Approve the single doc
      const approveBtn = wrapper.findAll('button').find(b => b.text() === 'Approve Remaining');
      await approveBtn?.trigger('click');

      const submitBtn = wrapper.findAll('button').find(b => b.text().includes('Submit Batch'));
      await submitBtn?.trigger('click');
      await wrapper.vm.$nextTick();

      expect(legalJobsServiceModule.legalJobsService.review).toHaveBeenCalledWith(
        'job-1',
        mockContext,
        expect.objectContaining({
          decision: 'batch_review',
          batchId: 'batch-rel',
        }),
      );
    });

    it('emits reviewed after successful submit', async () => {
      const wrapper = mountPanel(relevanceBatch);
      const approveBtn = wrapper.findAll('button').find(b => b.text() === 'Approve Remaining');
      await approveBtn?.trigger('click');

      const submitBtn = wrapper.findAll('button').find(b => b.text().includes('Submit Batch'));
      await submitBtn?.trigger('click');
      await wrapper.vm.$nextTick();
      await new Promise(r => setTimeout(r, 10)); // allow promise to resolve

      expect(wrapper.emitted('reviewed')).toBeTruthy();
    });
  });

  describe('expand/collapse', () => {
    it('expands a document row on click to show reasoning', async () => {
      const wrapper = mountPanel(privilegeBatch);
      // Initially no reasoning visible
      expect(wrapper.text()).not.toContain('Matches key criteria');

      // Click first doc row
      const docRow = wrapper.find('.batch-doc-row');
      await docRow.trigger('click');
      await wrapper.vm.$nextTick();

      // Reasoning now visible
      expect(wrapper.text()).toContain('Matches key criteria');
    });

    it('collapses a document row on second click', async () => {
      const wrapper = mountPanel(privilegeBatch);
      const docRow = wrapper.find('.batch-doc-row');
      await docRow.trigger('click');
      expect(wrapper.text()).toContain('Matches key criteria');

      await docRow.trigger('click');
      expect(wrapper.text()).not.toContain('Matches key criteria');
    });
  });
});

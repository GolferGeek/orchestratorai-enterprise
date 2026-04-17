import { codePrivilege } from './privilege';
import { fixtureProtocol } from '../../__fixtures__/protocol';
import { fixtureDocuments } from '../../__fixtures__/documents';

const mockLLMClient = { callLLM: jest.fn() } as any;

const baseCtx = {
  orgSlug: 'legal',
  userId: 'user-1',
  conversationId: 'conv-privilege-spec',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const legalMemoDoc = fixtureDocuments[2]!; // the attorney memo — expected to be privileged

beforeEach(() => jest.clearAllMocks());

describe('codePrivilege', () => {
  describe('happy path', () => {
    it('returns privileged for a legal memo', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          classification: 'privileged',
          confidence: 0.98,
          privilegeType: 'both',
          reasoning:
            'Document is explicitly marked as attorney-client communication and work product.',
        }),
      });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.classification).toBe('privileged');
      expect(result.privilegeType).toBe('both');
      expect(result.confidence).toBeCloseTo(0.98);
    });

    it('returns not_privileged when confidence is exactly 0.95', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          classification: 'not_privileged',
          confidence: 0.95,
          privilegeType: 'none',
          reasoning: 'No attorney involved.',
        }),
      });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      // 0.95 is exactly at the threshold — should stay not_privileged
      expect(result.classification).toBe('not_privileged');
    });
  });

  describe('CRITICAL safety rule — 0.95 threshold', () => {
    it('forces potentially_privileged when confidence is 0.94 (just below threshold)', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          classification: 'not_privileged',
          confidence: 0.94,
          privilegeType: 'none',
          reasoning: 'Probably not privileged.',
        }),
      });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.classification).toBe('potentially_privileged');
      // Confidence value is preserved — only classification is changed
      expect(result.confidence).toBeCloseTo(0.94);
    });

    it('forces potentially_privileged when confidence is 0.0', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          classification: 'not_privileged',
          confidence: 0.0,
          privilegeType: 'none',
          reasoning: 'Uncertain.',
        }),
      });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.classification).toBe('potentially_privileged');
    });

    it('forces potentially_privileged when confidence is 0.5', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          classification: 'not_privileged',
          confidence: 0.5,
          privilegeType: 'none',
          reasoning: 'Medium confidence.',
        }),
      });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.classification).toBe('potentially_privileged');
    });

    it('does NOT force potentially_privileged when already potentially_privileged', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          classification: 'potentially_privileged',
          confidence: 0.6,
          privilegeType: 'attorney_client',
          reasoning: 'Might be privileged.',
        }),
      });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.classification).toBe('potentially_privileged');
    });

    it('does NOT apply safety rule to privileged classification regardless of confidence', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          classification: 'privileged',
          confidence: 0.3,
          privilegeType: 'work_product',
          reasoning: 'Low confidence but classified as privileged.',
        }),
      });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      // Safety rule only applies to not_privileged → potentially_privileged upgrade
      expect(result.classification).toBe('privileged');
    });
  });

  describe('error handling', () => {
    it('defaults to potentially_privileged when JSON is unparseable', async () => {
      mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid json' });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.classification).toBe('potentially_privileged');
    });

    it('handles unknown privilegeType gracefully', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '{"classification":"privileged","confidence":0.9,"privilegeType":"unknown","reasoning":"..."}',
      });

      const result = await codePrivilege(
        legalMemoDoc,
        fixtureProtocol,
        mockLLMClient,
        baseCtx,
      );

      expect(result.privilegeType).toBe('none');
    });
  });
});

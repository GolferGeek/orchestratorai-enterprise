import { verifyOrReject, verifyBatch } from './citation-grounding.service';
import type { WorkflowRagService } from './workflow-rag.service';

function createMockRagService(
  returnValue: string,
): jest.Mocked<WorkflowRagService> {
  return {
    getContext: jest.fn().mockResolvedValue(returnValue),
  } as unknown as jest.Mocked<WorkflowRagService>;
}

describe('CitationGroundingService', () => {
  describe('verifyOrReject', () => {
    it('should return VerifiedCitation when source matches RAG results', async () => {
      const ragContext =
        '[smith-v-jones.pdf] Smith v. Jones held that... [doe-v-roe.pdf] Doe v. Roe established...';
      const mockRag = createMockRagService(ragContext);

      const result = await verifyOrReject(
        'smith-v-jones',
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result).not.toBeNull();
      expect(result!.source).toBe('smith-v-jones.pdf');
    });

    it('should return VerifiedCitation when text overlaps with RAG context', async () => {
      const ragContext =
        '[cases.pdf] The court in Smith v. Jones, 123 F.3d 456 (9th Cir. 2020) held that the Clean Water Act applies...';
      const mockRag = createMockRagService(ragContext);

      const result = await verifyOrReject(
        'Smith v. Jones, 123 F.3d 456 (9th Cir. 2020) held that the Clean Water Act applies',
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result).not.toBeNull();
    });

    it('should return null when citation not found in RAG', async () => {
      const ragContext = '[other-case.pdf] Unrelated case content...';
      const mockRag = createMockRagService(ragContext);

      const result = await verifyOrReject(
        'Completely Made Up v. Fictional Case, 999 F.3d 0',
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result).toBeNull();
    });

    it('should return null when RAG returns empty', async () => {
      const mockRag = createMockRagService('');

      const result = await verifyOrReject(
        'Smith v. Jones',
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result).toBeNull();
    });

    it('should return null for empty citation text', async () => {
      const mockRag = createMockRagService('some context');

      const result = await verifyOrReject(
        '',
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result).toBeNull();
    });

    it('should return null when RAG service throws', async () => {
      const mockRag = {
        getContext: jest.fn().mockRejectedValue(new Error('RAG unavailable')),
      } as unknown as jest.Mocked<WorkflowRagService>;

      const result = await verifyOrReject(
        'Smith v. Jones',
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result).toBeNull();
    });
  });

  describe('verifyBatch', () => {
    it('should separate verified and stripped citations', async () => {
      const ragContext = '[smith-v-jones.pdf] Smith v. Jones case content...';
      const mockRag = createMockRagService(ragContext);

      const result = await verifyBatch(
        ['smith-v-jones', 'Fake Case v. Nobody'],
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result.verified).toHaveLength(1);
      expect(result.stripped).toHaveLength(1);
      expect(result.stripped[0]).toBe('Fake Case v. Nobody');
    });

    it('should handle all verified citations', async () => {
      const ragContext = '[case-a.pdf] Case A... [case-b.pdf] Case B...';
      const mockRag = createMockRagService(ragContext);

      const result = await verifyBatch(
        ['case-a', 'case-b'],
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result.verified).toHaveLength(2);
      expect(result.stripped).toHaveLength(0);
    });

    it('should handle all stripped citations', async () => {
      const mockRag = createMockRagService('');

      const result = await verifyBatch(
        ['fake-1', 'fake-2'],
        mockRag,
        'law-contracts-hybrid',
        'test-org',
      );

      expect(result.verified).toHaveLength(0);
      expect(result.stripped).toHaveLength(2);
    });
  });
});

/**
 * Unit tests for DealMemoArtifactService.
 *
 * We mock MEDIA_STORAGE_PROVIDER but execute the real marked + docx code
 * path for renderMarkdownToDocx so we can assert the resulting .docx
 * buffer (a) has the DOCX ZIP magic, (b) round-trips back to recognizable
 * text through docx's own XML, and (c) survives pathological inputs
 * without silently dropping content.
 */
import { Test, type TestingModule } from '@nestjs/testing';
import * as zlib from 'zlib';
import {
  DealMemoArtifactService,
  MEMO_ARTIFACT_CONTENT_TYPES,
} from './deal-memo-artifact.service';
import { MEDIA_STORAGE_PROVIDER } from '@orchestratorai/planes/storage';

function makeMockStorage() {
  return {
    upload: jest
      .fn<Promise<{ path: string; publicUrl: string }>, unknown[]>()
      .mockImplementation(async (_bucket, path) => {
        const p = path as string;
        return { path: p, publicUrl: `https://fake/${p}` };
      }),
    download: jest
      .fn<Promise<{ data: Buffer; contentType: string }>, unknown[]>()
      .mockResolvedValue({
        data: Buffer.from('stored-bytes'),
        contentType: 'x',
      }),
    ensureBucketExists: jest.fn().mockResolvedValue(undefined),
    // Unused members stubbed for the MediaStorageProvider contract.
    storeGeneratedMedia: jest.fn(),
    downloadAndStore: jest.fn(),
    getAsset: jest.fn(),
    linkToDeliverableVersion: jest.fn(),
    deleteAsset: jest.fn(),
    deleteStorageObjects: jest.fn(),
    remove: jest.fn(),
    list: jest.fn(),
    getPublicUrl: jest.fn(),
    listBuckets: jest.fn(),
  };
}

// Extract the shared content of a .docx zip entry (word/document.xml)
// so we can assert the paragraphs we expect ended up there. We do a
// crude local-file-header scan rather than pulling in jszip.
function extractDocumentXml(buffer: Buffer): string {
  // Find the local file header for word/document.xml
  const filename = 'word/document.xml';
  const fnBytes = Buffer.from(filename, 'ascii');
  let searchFrom = 0;
  while (searchFrom < buffer.length - 30) {
    const sigAt = buffer.indexOf(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      searchFrom,
    );
    if (sigAt === -1) break;
    const fnLen = buffer.readUInt16LE(sigAt + 26);
    const extraLen = buffer.readUInt16LE(sigAt + 28);
    const compSize = buffer.readUInt32LE(sigAt + 18);
    const method = buffer.readUInt16LE(sigAt + 8);
    const nameStart = sigAt + 30;
    const dataStart = nameStart + fnLen + extraLen;
    const nameBuf = buffer.slice(nameStart, nameStart + fnLen);
    if (nameBuf.equals(fnBytes)) {
      const raw = buffer.slice(dataStart, dataStart + compSize);
      if (method === 0) return raw.toString('utf8');
      if (method === 8) return zlib.inflateRawSync(raw).toString('utf8');
      throw new Error(`Unsupported zip compression method ${method}`);
    }
    searchFrom = dataStart + compSize;
  }
  throw new Error('word/document.xml not found in DOCX buffer');
}

describe('DealMemoArtifactService', () => {
  let service: DealMemoArtifactService;
  let storage: ReturnType<typeof makeMockStorage>;

  beforeEach(async () => {
    storage = makeMockStorage();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealMemoArtifactService,
        { provide: MEDIA_STORAGE_PROVIDER, useValue: storage },
      ],
    }).compile();
    service = module.get(DealMemoArtifactService);
  });

  describe('path helpers', () => {
    it('memoMarkdownPath composes {memoJobId}/deal-memo.md', () => {
      expect(service.memoMarkdownPath('abc-123')).toBe('abc-123/deal-memo.md');
    });
    it('memoDocxPath composes {memoJobId}/deal-memo.docx', () => {
      expect(service.memoDocxPath('abc-123')).toBe('abc-123/deal-memo.docx');
    });
  });

  describe('uploadMemoMarkdown', () => {
    it('writes UTF-8 bytes to legal-documents with markdown content-type and returns path', async () => {
      const path = await service.uploadMemoMarkdown('job-1', '# Hello');
      expect(path).toBe('job-1/deal-memo.md');
      expect(storage.upload).toHaveBeenCalledTimes(1);
      const [bucket, storedPath, data, options] = storage.upload.mock.calls[0]!;
      expect(bucket).toBe('legal-documents');
      expect(storedPath).toBe('job-1/deal-memo.md');
      expect(Buffer.isBuffer(data)).toBe(true);
      expect((data as Buffer).toString('utf8')).toBe('# Hello');
      expect(options).toMatchObject({
        contentType: MEMO_ARTIFACT_CONTENT_TYPES.md,
        upsert: true,
      });
    });

    it('refuses to persist empty markdown', async () => {
      await expect(service.uploadMemoMarkdown('job-1', '')).rejects.toThrow(
        /refusing to write a zero-byte artifact/,
      );
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('propagates storage upload errors without swallowing', async () => {
      storage.upload.mockRejectedValueOnce(new Error('bucket offline'));
      await expect(service.uploadMemoMarkdown('job-1', '# ok')).rejects.toThrow(
        /bucket offline/,
      );
    });
  });

  describe('uploadMemoDocx', () => {
    it('converts markdown to a valid DOCX buffer and stores it with the correct content-type', async () => {
      const markdown = [
        '# Deal Memo',
        '',
        '## 1. Representations and Warranties',
        '',
        'The seller represents and warrants **ownership** of all *intellectual property* listed in Schedule 1.',
        '',
        '- Customer contracts',
        '- Supplier agreements',
        '',
        '## 2. Indemnification',
        '',
        'Buyer shall be indemnified for any breach of section 1.',
      ].join('\n');

      const path = await service.uploadMemoDocx('memo-42', markdown);
      expect(path).toBe('memo-42/deal-memo.docx');
      expect(storage.upload).toHaveBeenCalledTimes(1);
      const [bucket, storedPath, data, options] = storage.upload.mock.calls[0]!;
      expect(bucket).toBe('legal-documents');
      expect(storedPath).toBe('memo-42/deal-memo.docx');
      expect(options).toMatchObject({
        contentType: MEMO_ARTIFACT_CONTENT_TYPES.docx,
        upsert: true,
      });

      const buf = data as Buffer;
      // DOCX is a zip; must start with PK\x03\x04
      expect(buf.slice(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

      const xml = extractDocumentXml(buf);
      // Heading text and body text must survive the conversion.
      expect(xml).toContain('Deal Memo');
      expect(xml).toContain('Representations and Warranties');
      expect(xml).toContain('ownership');
      expect(xml).toContain('intellectual property');
      expect(xml).toContain('Customer contracts');
      expect(xml).toContain('Supplier agreements');
      expect(xml).toContain('Indemnification');
    });

    it('refuses empty markdown', async () => {
      await expect(service.uploadMemoDocx('memo-1', '   ')).rejects.toThrow(
        /zero-byte artifact/,
      );
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('propagates storage errors', async () => {
      storage.upload.mockRejectedValueOnce(new Error('disk full'));
      await expect(
        service.uploadMemoDocx('memo-1', '# Title\n\nBody'),
      ).rejects.toThrow(/disk full/);
    });
  });

  describe('renderMarkdownToDocx', () => {
    it('emits a non-empty DOCX for trivial input', async () => {
      const buf = await service.renderMarkdownToDocx('# Hi');
      expect(buf.length).toBeGreaterThan(500);
      expect(buf.slice(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    });

    it('does not lose content for blockquote + ordered-list markdown', async () => {
      const md = [
        '> Important note.',
        '',
        '1. First covenant',
        '2. Second covenant',
      ].join('\n');
      const buf = await service.renderMarkdownToDocx(md);
      const xml = extractDocumentXml(buf);
      expect(xml).toContain('Important note');
      expect(xml).toContain('First covenant');
      expect(xml).toContain('Second covenant');
    });
  });

  describe('downloadArtifact', () => {
    it('delegates to the storage provider with the legal-documents bucket', async () => {
      storage.download.mockResolvedValueOnce({
        data: Buffer.from('some-bytes'),
        contentType: 'text/markdown; charset=utf-8',
      });
      const res = await service.downloadArtifact('memo-42/deal-memo.md');
      expect(storage.download).toHaveBeenCalledWith(
        'legal-documents',
        'memo-42/deal-memo.md',
      );
      expect(res.data.toString('utf8')).toBe('some-bytes');
    });

    it('does not swallow storage errors', async () => {
      storage.download.mockRejectedValueOnce(new Error('not found'));
      await expect(
        service.downloadArtifact('memo-42/deal-memo.md'),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('onModuleInit', () => {
    it('ensures the legal-documents bucket but only warns on failure', async () => {
      storage.ensureBucketExists.mockRejectedValueOnce(new Error('transient'));
      // Should not throw — matches LegalDocumentsStorageService behavior.
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(storage.ensureBucketExists).toHaveBeenCalledWith(
        'legal-documents',
        expect.objectContaining({ public: false }),
      );
    });
  });
});

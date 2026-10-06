import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { OutboundUrlValidatorService } from '../common/outbound/outbound-url-validator.service';
import type { WorkflowDocumentsService } from '../workflows/shared/documents/workflow-documents.service';
import { filesOf, inboundFile, InboundFilesService } from './inbound-files';

describe('files a caller sends', () => {
  let server: Server;
  let origin: string;
  const served: Record<string, { type: string; body: Buffer; status?: number }> = {
    '/po.pdf': { type: 'application/pdf', body: Buffer.from('%PDF-1.4 po') },
    '/sheet.csv': { type: 'text/csv', body: Buffer.from('a,b\n1,2') },
    '/moved': { type: 'application/pdf', body: Buffer.alloc(0), status: 302 },
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      const file = served[req.url ?? ''];
      if (!file) return void res.writeHead(404).end();
      res.writeHead(file.status ?? 200, { 'Content-Type': file.type, ...(file.status === 302 ? { Location: '/po.pdf' } : {}) }).end(file.body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const setup = () => {
    const documents = { store: jest.fn(async (_c: unknown, f: { originalname: string; mimetype: string; buffer: Buffer }) => ({ ref: `o/c/${f.originalname}`, filename: f.originalname, mimeType: f.mimetype, bytes: f.buffer.toString() })) };
    // The safety check is the real one's job; here it maps the caller's https URL to the local server.
    const outbound = { assertSafe: jest.fn(async (url: string) => new URL(url.replace('https://buyer.example', origin))) };
    return { documents, outbound, service: new InboundFilesService(documents as unknown as WorkflowDocumentsService, outbound as unknown as OutboundUrlValidatorService) };
  };
  const context = { orgSlug: 'acme', conversationId: 'c' } as never;

  it('stores inline files and fetched ones as documents, through the safety check', async () => {
    const { service, documents, outbound } = setup();
    const refs = await service.store(context, [
      { filename: 'po.pdf', mediaType: 'application/pdf', raw: Buffer.from('%PDF inline').toString('base64') },
      { filename: 'sheet.csv', mediaType: '', url: 'https://buyer.example/sheet.csv' },
    ]);
    expect(outbound.assertSafe).toHaveBeenCalledWith('https://buyer.example/sheet.csv');
    expect(refs).toMatchObject([{ filename: 'po.pdf', mimeType: 'application/pdf', bytes: '%PDF inline' }, { filename: 'sheet.csv', mimeType: 'text/csv', bytes: 'a,b\n1,2' }]);
    expect(documents.store).toHaveBeenCalledTimes(2);
  });

  it('refuses a URL that redirects, answers an error, or serves another type than declared', async () => {
    const { service, documents } = setup();
    await expect(service.store(context, [{ filename: 'x.pdf', mediaType: 'application/pdf', url: 'https://buyer.example/moved' }])).rejects.toThrow('answered HTTP 302');
    await expect(service.store(context, [{ filename: 'x.pdf', mediaType: 'application/pdf', url: 'https://buyer.example/gone' }])).rejects.toThrow('answered HTTP 404');
    await expect(service.store(context, [{ filename: 'x.pdf', mediaType: 'application/pdf', url: 'https://buyer.example/sheet.csv' }])).rejects.toThrow(
      'was sent as application/pdf but its URL serves text/csv',
    );
    expect(documents.store).not.toHaveBeenCalled();
  });

  it('checks a file part, and the files list it becomes', () => {
    expect(inboundFile({ raw: 'AAAA', mediaType: 'image/png; charset=binary' }, 0)).toEqual({ filename: 'file', mediaType: 'image/png', raw: 'AAAA' });
    expect(() => inboundFile({ raw: 'A'.repeat(36 * 1024 * 1024), mediaType: 'application/pdf' }, 1)).toThrow('between 1 byte and 25 MB');
    expect(() => filesOf({ files: [{ filename: 'a', mediaType: 'text/csv', raw: 'x', url: 'https://y' }] })).toThrow('is not a file');
    expect(filesOf({ message: 'hi' })).toEqual([]);
  });
});

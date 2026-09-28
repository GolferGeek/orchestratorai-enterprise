import type { DatabaseService } from '@orchestrator-ai/transport-types';
import { MediaStorageHelper } from '../supabase-media-storage.service';
import { storedContentType } from '../stored-content-type';
import type { SupabaseService } from '../../database/supabase-client.service';

describe('the stored content type of a download', () => {
  it('is the type the object was stored with, parameters dropped', () => {
    expect(storedContentType('text/plain;charset=UTF-8', 'b', 'a.txt')).toBe('text/plain');
    expect(storedContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'b', 'a.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('is never guessed: an object without one is an error', () => {
    for (const missing of [undefined, null, '', '  ']) {
      expect(() => storedContentType(missing, 'intake', 'invoices/a.txt')).toThrow('intake/invoices/a.txt has no stored content type');
    }
  });

  it('comes from Supabase with the file, whatever its extension', async () => {
    const download = jest.fn().mockResolvedValue({ data: new Blob(['Invoice INV-77001'], { type: 'text/plain;charset=UTF-8' }), error: null });
    const supabase = { getServiceClient: () => ({ storage: { from: () => ({ download }) } }) } as unknown as SupabaseService;
    const storage = new MediaStorageHelper({} as DatabaseService, supabase);
    const result = await storage.download('intake', 'invoices/PO-4502/INV-77001.txt');
    expect(result.contentType).toBe('text/plain');
    expect(result.data.toString()).toBe('Invoice INV-77001');

    download.mockResolvedValueOnce({ data: new Blob(['x']), error: null });
    await expect(storage.download('intake', 'invoices/x.bin')).rejects.toThrow('has no stored content type');
  });
});

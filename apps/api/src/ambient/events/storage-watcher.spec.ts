import type { StorageWatch } from '../ambient-database/database.service';
import { storageEventPayload, watchesFor, type StoredObject } from './storage-watcher.service';

const object = (name: string, bucket = 'intake'): StoredObject => ({
  id: 'obj-1',
  bucket_id: bucket,
  name,
  metadata: { size: 2048, mimetype: 'application/pdf' },
  created_at: '2026-09-28T12:00:00Z',
});
const watch = (prefix: string, extra: Partial<StorageWatch> = {}): StorageWatch => ({
  id: `w-${prefix}`, org_slug: 'finance', bucket: 'intake', prefix, event: 'invoice.received', enabled: true, created_by: null, created_at: 't', ...extra,
});

describe('which watched folders a new file falls under', () => {
  it('matches the bucket and a path under the folder; the whole bucket matches everything in it', () => {
    const watches = [watch('invoices/'), watch(''), watch('submittals/'), watch('invoices/', { bucket: 'other' }), watch('invoices/', { enabled: false, id: 'off' })];
    expect(watchesFor(object('invoices/2026/INV-7.pdf'), watches).map((w) => w.id)).toEqual(['w-invoices/', 'w-']);
    expect(watchesFor(object('submittals/door.pdf'), watches).map((w) => w.id)).toEqual(['w-', 'w-submittals/']);
    expect(watchesFor(object('invoices-old/x.pdf'), [watch('invoices/')])).toEqual([]);
  });

  it('ignores the placeholder Supabase writes when a folder is created', () => {
    expect(watchesFor(object('invoices/.emptyFolderPlaceholder'), [watch('')])).toEqual([]);
  });

  it('describes the file, not its contents, with its folders for triggers to read', () => {
    expect(storageEventPayload(object('invoices/PO-4502/INV-7.pdf'))).toEqual({
      channel: 'storage', bucket: 'intake', path: 'invoices/PO-4502/INV-7.pdf', filename: 'INV-7.pdf', folders: ['invoices', 'PO-4502'],
      objectId: 'obj-1', size: 2048, mimeType: 'application/pdf', uploadedAt: '2026-09-28T12:00:00Z',
    });
    expect(storageEventPayload(object('INV-8.pdf'))).toMatchObject({ filename: 'INV-8.pdf', folders: [] });
  });
});

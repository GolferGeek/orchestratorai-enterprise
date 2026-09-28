import type { WorkflowAdminRow } from '@orchestrator-ai/transport-types';
import { AdminRowError, type WorkflowAdminSection } from '../shared/admin';
import type { CompetitorSource, SourcesStoreService } from './sources-store.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toRow = (s: CompetitorSource): WorkflowAdminRow => ({ id: s.id, competitor: s.competitor, page: s.page, url: s.url, enabled: s.enabled });

function source(row: WorkflowAdminRow): { competitor: string; page: string; url: string; enabled: boolean } {
  const { competitor, page, url, enabled } = row as { competitor: string; page: string; url: string; enabled: boolean };
  if (!url.startsWith('https://')) throw new AdminRowError('URL must be an https:// address');
  return { competitor, page, url, enabled };
}

/** The pages the org follows. A disabled page is kept but not checked. */
export function competitorWatchAdminSections(store: SourcesStoreService): WorkflowAdminSection[] {
  return [
    {
      key: 'sources',
      label: 'Pages',
      description: "Competitors' pages checked on every run. Each is compared with its last capture (the first run uses the Internet Archive copy from about 90 days ago).",
      kind: 'list',
      idField: 'id',
      titleField: 'competitor',
      fields: [
        { key: 'id', label: 'Id', kind: 'text', required: true, readOnly: true },
        { key: 'competitor', label: 'Competitor', kind: 'text', required: true, maxLength: 100 },
        { key: 'page', label: 'Page', kind: 'text', required: true, maxLength: 100, help: 'e.g. Pricing, Product, Careers' },
        { key: 'url', label: 'URL', kind: 'url', required: true, maxLength: 500 },
        { key: 'enabled', label: 'Checked on each run', kind: 'boolean', required: true },
      ],
      list: async (org) => (await store.list(org)).map(toRow),
      create: async (org, row, userId) => toRow(await store.add(org, source(row), userId)),
      update: async (org, id, row) => {
        if (!UUID.test(id)) throw new AdminRowError(`No page ${id}`);
        const updated = await store.update(org, id, source(row));
        if (!updated) throw new AdminRowError(`No page ${id}`);
        return toRow(updated);
      },
      remove: (org, id) => (UUID.test(id) ? store.remove(org, id) : Promise.resolve(false)),
    },
  ];
}

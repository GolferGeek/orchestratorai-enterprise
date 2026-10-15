/**
 * RAG content is scoped by organization, and an item with no organization is
 * global (Matt, 2026-10-15; migration 20261015130000). Against the real
 * rag_data tables: organization A never reads organization B's collections,
 * documents, chunks or search hits, and both read the global ones. Checked at
 * every layer a read goes through: the rag_data SQL functions themselves (the
 * database enforces it whatever the caller passes), both Postgres RAG storage
 * planes (Supabase/pg and Cloud SQL), and the RAG admin service.
 *
 * Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it. Its rows are in the
 * organizations 'rag-scope-a' and 'rag-scope-b' plus global collections with a
 * random slug, all removed after.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { SupabaseRagStorageService } from '@orchestratorai/planes/rag/supabase-rag-storage.service';
import { PostgresqlRagStorageService } from '@orchestratorai/planes/rag/postgresql-rag-storage.service';
import type { RagStorageService } from '@orchestratorai/planes/rag/rag-storage.interface';
import { RagManagementService } from './rag-management.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

const ORG_A = 'rag-scope-a';
const ORG_B = 'rag-scope-b';
const SUFFIX = randomUUID().slice(0, 8);
/** One shared embedding: every chunk matches the query exactly (score 1). */
const EMBEDDING = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
const EMBEDDING_LITERAL = `[${EMBEDDING.join(',')}]`;

interface Seeded {
  collectionId: string;
  documentId: string;
  slug: string;
}

describeWithDb('RAG organization scope (null organization = global)', () => {
  let db: PostgresqlDatabaseService;
  let a: Seeded;
  let b: Seeded;
  let global: Seeded;
  /** Organization A's own collection whose slug a global one also has. */
  let shadow: { own: Seeded; global: Seeded };

  async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as T[];
  }

  async function seed(org: string | null, slug: string, words: string): Promise<Seeded> {
    const [collection] = await sql<{ id: string }>(
      `INSERT INTO rag_data.rag_collections (organization_slug, name, slug) VALUES ($1, $2, $2) RETURNING id`,
      [org, slug],
    );
    const [document] = await sql<{ id: string }>(
      `INSERT INTO rag_data.rag_documents (collection_id, organization_slug, filename, file_type, file_size, status, content)
       VALUES ($1, $2, $3, 'md', 10, 'completed', $4) RETURNING id`,
      [collection!.id, org, `${slug}.md`, words],
    );
    await sql(
      `INSERT INTO rag_data.rag_document_chunks (document_id, collection_id, organization_slug, content, chunk_index, embedding, token_count)
       VALUES ($1, $2, $3, $4, 0, $5::rag_data.vector, 3)`,
      [document!.id, collection!.id, org, words, EMBEDDING_LITERAL],
    );
    return { collectionId: collection!.id, documentId: document!.id, slug };
  }

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    a = await seed(ORG_A, `scope-a-${SUFFIX}`, 'alpha confidential retainer');
    b = await seed(ORG_B, `scope-b-${SUFFIX}`, 'bravo confidential retainer');
    global = await seed(null, `scope-global-${SUFFIX}`, 'global confidential retainer');
    shadow = {
      own: await seed(ORG_A, `scope-shared-${SUFFIX}`, 'own shadow retainer'),
      global: await seed(null, `scope-shared-${SUFFIX}`, 'global shadow retainer'),
    };
  });

  afterAll(async () => {
    const ids = [a, b, global, shadow.own, shadow.global].filter(Boolean).map((s) => s.collectionId);
    await sql(`DELETE FROM rag_data.rag_collections WHERE id = ANY($1::uuid[])`, [ids]);
    await db.onModuleDestroy();
  });

  describe('the rag_data SQL functions', () => {
    async function collectionIds(org: string): Promise<string[]> {
      const rows = await sql<{ id: string }>(`SELECT id FROM rag_data.rag_get_collections($1, NULL)`, [org]);
      return rows.map((r) => r.id);
    }

    it("list an organization's own collections and the global ones, never another organization's", async () => {
      const forA = await collectionIds(ORG_A);
      expect(forA).toEqual(expect.arrayContaining([a.collectionId, global.collectionId]));
      expect(forA).not.toContain(b.collectionId);

      const forB = await collectionIds(ORG_B);
      expect(forB).toEqual(expect.arrayContaining([b.collectionId, global.collectionId]));
      expect(forB).not.toContain(a.collectionId);
    });

    it("refuse another organization's collection by id and by slug, and give the global one to both", async () => {
      const byId = (id: string, org: string) => sql(`SELECT id FROM rag_data.rag_get_collection($1, $2)`, [id, org]);
      const bySlug = (slug: string, org: string) => sql(`SELECT id FROM rag_data.rag_get_collection_by_slug($1, $2)`, [slug, org]);

      expect(await byId(b.collectionId, ORG_A)).toEqual([]);
      expect(await bySlug(b.slug, ORG_A)).toEqual([]);
      expect(await byId(a.collectionId, ORG_B)).toEqual([]);
      for (const org of [ORG_A, ORG_B]) {
        expect(await byId(global.collectionId, org)).toEqual([{ id: global.collectionId }]);
        expect(await bySlug(global.slug, org)).toEqual([{ id: global.collectionId }]);
      }
    });

    it("prefer an organization's own collection over a global one with the same slug", async () => {
      expect(await sql(`SELECT id FROM rag_data.rag_get_collection_by_slug($1, $2)`, [shadow.own.slug, ORG_A]))
        .toEqual([{ id: shadow.own.collectionId }]);
      expect(await sql(`SELECT id FROM rag_data.rag_get_collection_by_slug($1, $2)`, [shadow.own.slug, ORG_B]))
        .toEqual([{ id: shadow.global.collectionId }]);
    });

    it("never return another organization's documents or chunks, and return the global ones to both", async () => {
      const reads = async (s: Seeded, org: string) => ({
        documents: (await sql(`SELECT id FROM rag_data.rag_get_documents($1, $2)`, [s.collectionId, org])).length,
        document: (await sql(`SELECT id FROM rag_data.rag_get_document($1, $2)`, [s.documentId, org])).length,
        content: (await sql(`SELECT id FROM rag_data.rag_get_document_content($1, $2)`, [s.documentId, org])).length,
        chunks: (await sql(`SELECT id FROM rag_data.rag_get_document_chunks($1, $2)`, [s.documentId, org])).length,
      });
      const none = { documents: 0, document: 0, content: 0, chunks: 0 };
      const one = { documents: 1, document: 1, content: 1, chunks: 1 };

      expect(await reads(b, ORG_A)).toEqual(none);
      expect(await reads(a, ORG_B)).toEqual(none);
      expect(await reads(a, ORG_A)).toEqual(one);
      expect(await reads(global, ORG_A)).toEqual(one);
      expect(await reads(global, ORG_B)).toEqual(one);
    });

    it("never return another organization's chunks from a search, and return the global ones to both", async () => {
      const search = (s: Seeded, org: string) =>
        sql(`SELECT chunk_id FROM rag_data.rag_search($1, $2, $3::rag_data.vector, 5, 0.5)`, [s.collectionId, org, EMBEDDING_LITERAL]);

      expect(await search(b, ORG_A)).toEqual([]);
      expect(await search(a, ORG_B)).toEqual([]);
      expect(await search(a, ORG_A)).toHaveLength(1);
      expect(await search(global, ORG_A)).toHaveLength(1);
      expect(await search(global, ORG_B)).toHaveLength(1);
    });

    it('let no organization change or delete a global collection or its documents', async () => {
      const [updated] = await sql<{ id: string | null }>(
        `SELECT id FROM rag_data.rag_update_collection($1::uuid, $2::text, 'renamed'::varchar, NULL::text, NULL::text, NULL::uuid[], false, NULL::varchar)`,
        [global.collectionId, ORG_A],
      );
      expect(updated?.id ?? null).toBeNull();
      expect(await sql(`SELECT rag_data.rag_delete_collection($1, $2) AS deleted`, [global.collectionId, ORG_A]))
        .toEqual([{ deleted: false }]);
      expect(await sql(`SELECT rag_data.rag_delete_document($1, $2) AS deleted`, [global.documentId, ORG_A]))
        .toEqual([{ deleted: false }]);
      expect(await sql(`SELECT name FROM rag_data.rag_collections WHERE id = $1`, [global.collectionId]))
        .toEqual([{ name: global.slug }]);
    });
  });

  describe.each([
    [
      'Supabase (pg) storage plane',
      () =>
        new SupabaseRagStorageService(
          // The plane sets search_path on one pooled connection only; set it on all.
          new ConfigService({ DATABASE_URL: withRagSearchPath(url!) }),
        ),
    ],
    ['Cloud SQL (postgresql) storage plane', () => new PostgresqlRagStorageService(new ConfigService({ POSTGRESQL_URL: withRagSearchPath(url!) }))],
  ])('the %s', (_name, create) => {
    let storage: RagStorageService & { onModuleInit?: () => Promise<void>; onModuleDestroy?: () => Promise<void> };

    beforeAll(async () => {
      storage = create() as typeof storage;
      await storage.onModuleInit?.();
    });

    afterAll(async () => {
      await storage.onModuleDestroy?.();
    });

    it("lists an organization's own and the global collections, never another organization's", async () => {
      const forA = (await storage.getCollections(ORG_A)).map((c) => c.id);
      expect(forA).toEqual(expect.arrayContaining([a.collectionId, global.collectionId]));
      expect(forA).not.toContain(b.collectionId);
      expect(await storage.getCollection(b.collectionId, ORG_A)).toBeNull();
      expect((await storage.getCollection(global.collectionId, ORG_B))?.id).toBe(global.collectionId);
      expect((await storage.getCollectionBySlug(shadow.own.slug, ORG_A))?.id).toBe(shadow.own.collectionId);
    });

    it("reads no document or chunk of another organization, and the global ones for both", async () => {
      expect(await storage.getDocuments(b.collectionId, ORG_A)).toEqual([]);
      expect(await storage.getDocument(b.documentId, ORG_A)).toBeNull();
      expect(await storage.getDocumentContent(b.documentId, ORG_A)).toBeNull();
      expect(await storage.getDocumentChunks(b.documentId, ORG_A)).toEqual([]);
      for (const org of [ORG_A, ORG_B]) {
        expect(await storage.getDocuments(global.collectionId, org)).toHaveLength(1);
        expect((await storage.getDocument(global.documentId, org))?.id).toBe(global.documentId);
        expect((await storage.getDocumentContent(global.documentId, org))?.id).toBe(global.documentId);
        expect(await storage.getDocumentChunks(global.documentId, org)).toHaveLength(1);
      }
    });

    it("finds no chunk of another organization by vector or keyword, and the global ones for both", async () => {
      expect(await storage.vectorSearch(b.collectionId, ORG_A, EMBEDDING, 5, 0.5)).toEqual([]);
      expect(await storage.keywordSearch(b.collectionId, ORG_A, 'confidential retainer', 5)).toEqual([]);
      for (const org of [ORG_A, ORG_B]) {
        expect(await storage.vectorSearch(global.collectionId, org, EMBEDDING, 5, 0.5)).toHaveLength(1);
        expect(await storage.keywordSearch(global.collectionId, org, 'confidential retainer', 5)).toHaveLength(1);
      }
    });

    if (_name.startsWith('Supabase')) {
      it("searches across an organization's own and the global collections, never another organization's", async () => {
        const supabase = storage as unknown as SupabaseRagStorageService;
        const hits = (await supabase.globalVectorSearch(ORG_A, EMBEDDING, 100, 0.5)).map((h) => h.content);
        expect(hits).toEqual(expect.arrayContaining(['alpha confidential retainer', 'global confidential retainer']));
        expect(hits).not.toContain('bravo confidential retainer');
      });
    }
  });

  describe('the RAG admin service', () => {
    it("lists an organization's own and the global collections, never another organization's", async () => {
      const rag = new RagManagementService(db, { getDimensions: () => 768 } as never, new ConfigService({}));
      const forA = (await rag.listCollections(ORG_A)).collections;
      const ids = forA.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining([a.collectionId, global.collectionId]));
      expect(ids).not.toContain(b.collectionId);
      expect(forA.find((c) => c.id === global.collectionId)?.orgSlug).toBeNull();
    });

    it('refuses an organization slug that would change the filter', async () => {
      const rag = new RagManagementService(db, { getDimensions: () => 768 } as never, new ConfigService({}));
      await expect(rag.listCollections(`${ORG_A},organization_slug.eq.${ORG_B}`)).rejects.toThrow('Invalid organization slug');
    });
  });
});

/** The connection string with search_path rag_data on every connection. */
function withRagSearchPath(connectionString: string): string {
  const separator = connectionString.includes('?') ? '&' : '?';
  return `${connectionString}${separator}options=${encodeURIComponent('-c search_path=rag_data,public')}`;
}

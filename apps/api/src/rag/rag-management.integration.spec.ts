/**
 * RAG documents against the real rag_data tables: an upload keeps its file's
 * hash, and the list returns it, so a seed can tell a changed file from the
 * same one. Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it. Its collection is in
 * the org 'rag-spec' and removed after.
 */
import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { RagManagementService } from './rag-management.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('RAG documents against Postgres', () => {
  let db: PostgresqlDatabaseService;
  let rag: RagManagementService;
  let collectionId: string;

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    rag = new RagManagementService(
      db,
      { getDimensions: () => 768 } as never,
      new ConfigService({ EMBEDDING_MODEL: 'spec-embedding' }),
    );
    collectionId = (await rag.createCollection({ name: `rag spec ${randomUUID().slice(0, 8)}`, orgSlug: 'rag-spec' })).id;
  });

  afterAll(async () => {
    await db.rawQuery(`DELETE FROM rag_data.rag_documents WHERE collection_id = $1`, [collectionId]);
    await db.rawQuery(`DELETE FROM rag_data.rag_collections WHERE id = $1`, [collectionId]);
  });

  it('keeps an upload\'s file hash and lists it', async () => {
    const hash = createHash('sha256').update('# Runbook\n').digest('hex');
    const document = await rag.uploadDocument(collectionId, 'rag-spec', 'runbook.md', 'md', 10, hash);
    expect(document).toMatchObject({ filename: 'runbook.md', sizeBytes: 10, fileHash: hash });
    expect((await rag.listDocuments(collectionId)).documents).toEqual([expect.objectContaining({ id: document.id, fileHash: hash })]);
  });
});

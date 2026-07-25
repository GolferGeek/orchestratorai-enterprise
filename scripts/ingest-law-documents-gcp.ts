/**
 * Law Documents Ingestion Script — GCP / OpenRouter profile
 *
 * GCP variant of ingest-law-documents.ts. Instead of Ollama/nomic-embed-text,
 * it embeds with OpenRouter's text-embedding-3-small (768d, matching the Cloud
 * SQL pgvector contract) and targets the `legal` organization, so the vectors
 * match what the RAG collections were created with.
 *
 * Usage (through the Cloud SQL Auth Proxy):
 *   DATABASE_URL=postgresql://postgres:PW@127.0.0.1:PORT/orchestrator_ai \
 *   OPENROUTER_API_KEY=... \
 *   npx ts-node scripts/ingest-law-documents-gcp.ts
 *
 * Prerequisites:
 * - Cloud SQL reachable via DATABASE_URL (auth proxy)
 * - OPENROUTER_API_KEY set
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error('ERROR: OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 768;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH = 32;
const ORG_SLUG = 'legal';
const SOURCE_ROOT = 'law';

const pool = new Pool({ connectionString: DATABASE_URL });

const COLLECTION_MAPPING: Record<string, { slug: string; files: string[] }> = {
  'law-firm-policies-attributed': {
    slug: 'law-firm-policies-attributed',
    files: [
      'firm-policies/billing/fee-agreement-policy.md',
      'firm-policies/ethics/client-confidentiality-policy.md',
      'firm-policies/ethics/conflict-of-interest-policy.md',
      'firm-policies/operations/file-retention-policy.md',
    ],
  },
  'law-contracts-hybrid': {
    slug: 'law-contracts-hybrid',
    files: [
      'contracts/clause-library/master-clause-library.md',
      'contracts/templates/engagement-letter-template.md',
      'contracts/templates/master-services-agreement.md',
      'contracts/templates/standard-nda-template.md',
    ],
  },
  'law-litigation-cross-reference': {
    slug: 'law-litigation-cross-reference',
    files: [
      'litigation/discovery/deposition-checklist.md',
      'litigation/discovery/written-discovery-checklist.md',
      'litigation/motions/motion-to-dismiss-checklist.md',
      'litigation/trial-prep/trial-preparation-checklist.md',
    ],
  },
  'law-client-intake-temporal': {
    slug: 'law-client-intake-temporal',
    files: [
      'client-intake/checklists/personal-injury-intake-checklist.md',
      'client-intake/checklists/personal-injury-intake-checklist-v2.md',
    ],
  },
  'law-estate-planning-attributed': {
    slug: 'law-estate-planning-attributed',
    files: ['estate-planning/guides/basic-estate-plan-guide.md'],
  },
};

interface Embedded {
  embedding: number[];
  tokenCount: number;
}

/** Embed a batch of texts via OpenRouter text-embedding-3-small (768d). */
async function embedBatch(texts: string[]): Promise<Embedded[]> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://orchestratorai.io',
      'X-Title': process.env.OPENROUTER_SITE_NAME || 'Orchestrator AI',
    },
    body: JSON.stringify({
      model: `openai/${EMBEDDING_MODEL}`,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter embedding error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage?: { prompt_tokens?: number };
  };
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid embedding response from OpenRouter');
  }

  const sorted = [...data.data].sort((a, b) => a.index - b.index);
  for (const item of sorted) {
    if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `OpenRouter returned ${item.embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
  }
  const totalTokens = data.usage?.prompt_tokens || 0;
  const tokensPerInput = Math.ceil(totalTokens / texts.length) || 0;
  return sorted.map((item) => ({ embedding: item.embedding, tokenCount: tokensPerInput }));
}

function chunkText(
  text: string,
  chunkSize: number,
  overlap: number,
): Array<{ content: string; charOffset: number }> {
  const chunks: Array<{ content: string; charOffset: number }> = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  let currentOffset = 0;
  let chunkStartOffset = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 > chunkSize && currentChunk.length > 0) {
      chunks.push({ content: currentChunk.trim(), charOffset: chunkStartOffset });
      const overlapStart = Math.max(0, currentChunk.length - overlap);
      currentChunk = currentChunk.slice(overlapStart) + '\n\n' + para;
      chunkStartOffset = currentOffset - (currentChunk.length - para.length - 2);
    } else {
      if (currentChunk.length === 0) chunkStartOffset = currentOffset;
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + para;
    }
    currentOffset += para.length + 2;
  }
  if (currentChunk.trim().length > 0) {
    chunks.push({ content: currentChunk.trim(), charOffset: chunkStartOffset });
  }
  return chunks;
}

async function getCollection(slug: string): Promise<{ id: string; name: string } | null> {
  const result = await pool.query(
    'SELECT id, name FROM rag_data.rag_collections WHERE slug = $1 AND organization_slug = $2',
    [slug, ORG_SLUG],
  );
  return result.rows.length ? result.rows[0] : null;
}

async function documentExists(collectionId: string, fileHash: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM rag_data.rag_documents WHERE collection_id = $1 AND file_hash = $2 LIMIT 1',
    [collectionId, fileHash],
  );
  return result.rows.length > 0;
}

async function createDocument(
  collectionId: string,
  filename: string,
  content: string,
  sourcePath: string,
): Promise<string> {
  const fileHash = crypto.createHash('sha256').update(content).digest('hex');
  const metadata = JSON.stringify({
    sourcePath: `docs/RAG-filler/${SOURCE_ROOT}/${sourcePath}`,
    title: filename.replace('.md', '').replace(/-/g, ' '),
  });
  const result = await pool.query(
    `INSERT INTO rag_data.rag_documents
     (collection_id, organization_slug, filename, file_type, file_size, file_hash, status, content, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [collectionId, ORG_SLUG, filename, 'md', Buffer.byteLength(content, 'utf8'), fileHash, 'processing', content, metadata],
  );
  return result.rows[0].id;
}

async function insertChunks(
  documentId: string,
  collectionId: string,
  chunks: Array<{ content: string; charOffset: number; embedding: number[]; tokenCount: number }>,
): Promise<number> {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embeddingStr = `[${chunk.embedding.join(',')}]`;
    await pool.query(
      `INSERT INTO rag_data.rag_document_chunks
       (document_id, collection_id, organization_slug, content, chunk_index, embedding, token_count, char_offset, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [documentId, collectionId, ORG_SLUG, chunk.content, i, embeddingStr, chunk.tokenCount, chunk.charOffset, '{}'],
    );
  }
  return chunks.length;
}

async function updateDocumentStatus(
  documentId: string,
  status: string,
  chunkCount: number,
  tokenCount: number,
): Promise<void> {
  await pool.query(
    `UPDATE rag_data.rag_documents
     SET status = $1, chunk_count = $2, token_count = $3, processed_at = NOW()
     WHERE id = $4`,
    [status, chunkCount, tokenCount, documentId],
  );
}

async function updateCollectionCounts(collectionId: string): Promise<void> {
  const result = await pool.query(
    `SELECT COUNT(*) as doc_count,
            COALESCE(SUM(chunk_count), 0) as chunk_count,
            COALESCE(SUM(token_count), 0) as total_tokens
     FROM rag_data.rag_documents
     WHERE collection_id = $1 AND status = 'completed'`,
    [collectionId],
  );
  const { doc_count, chunk_count, total_tokens } = result.rows[0];
  await pool.query(
    `UPDATE rag_data.rag_collections
     SET document_count = $1, chunk_count = $2, total_tokens = $3
     WHERE id = $4`,
    [parseInt(doc_count), parseInt(chunk_count), parseInt(total_tokens), collectionId],
  );
}

async function processFile(
  collectionId: string,
  filePath: string,
  basePath: string,
): Promise<{ success: boolean; chunks: number; tokens: number }> {
  const fullPath = path.join(basePath, filePath);
  const filename = path.basename(filePath);
  console.log(`  Processing: ${filename}`);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    if (await documentExists(collectionId, fileHash)) {
      console.log('    ⏭ Already ingested (skipping)');
      return { success: true, chunks: 0, tokens: 0 };
    }

    const documentId = await createDocument(collectionId, filename, content, filePath);
    const textChunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`    Created ${textChunks.length} chunks`);

    const embedded: Array<{ content: string; charOffset: number; embedding: number[]; tokenCount: number }> = [];
    let totalTokens = 0;
    for (let i = 0; i < textChunks.length; i += EMBED_BATCH) {
      const batch = textChunks.slice(i, i + EMBED_BATCH);
      process.stdout.write(`    Embedding ${Math.min(i + batch.length, textChunks.length)}/${textChunks.length}\r`);
      const results = await embedBatch(batch.map((c) => c.content));
      results.forEach((r, j) => {
        embedded.push({ ...batch[j], embedding: r.embedding, tokenCount: r.tokenCount });
        totalTokens += r.tokenCount;
      });
    }

    const insertedCount = await insertChunks(documentId, collectionId, embedded);
    await updateDocumentStatus(documentId, 'completed', insertedCount, totalTokens);
    console.log(`    ✓ Completed: ${insertedCount} chunks, ${totalTokens} tokens`);
    return { success: true, chunks: insertedCount, tokens: totalTokens };
  } catch (error) {
    console.error(`    ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, chunks: 0, tokens: 0 };
  }
}

async function main(): Promise<void> {
  console.log('=== Law Documents Ingestion (GCP / OpenRouter) ===\n');
  const basePath = path.resolve(process.cwd(), `docs/RAG-filler/${SOURCE_ROOT}`);

  let totalDocs = 0;
  let totalChunks = 0;
  let totalTokens = 0;
  let failedDocs = 0;

  for (const [collectionKey, config] of Object.entries(COLLECTION_MAPPING)) {
    console.log(`\n📁 Collection: ${collectionKey}`);
    const collection = await getCollection(config.slug);
    if (!collection) {
      console.error(`   ❌ Collection not found under org '${ORG_SLUG}': ${config.slug}`);
      continue;
    }
    console.log(`   ID: ${collection.id}`);
    for (const file of config.files) {
      const result = await processFile(collection.id, file, basePath);
      if (result.success) {
        totalDocs++;
        totalChunks += result.chunks;
        totalTokens += result.tokens;
      } else {
        failedDocs++;
      }
    }
    await updateCollectionCounts(collection.id);
  }

  console.log('\n=== Summary ===');
  console.log(`Documents processed: ${totalDocs}`);
  console.log(`Documents failed: ${failedDocs}`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`Total tokens: ${totalTokens}`);
  console.log('\n✓ Ingestion complete!');
  await pool.end();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

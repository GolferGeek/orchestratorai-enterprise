/**
 * Law Documents Ingestion Script
 *
 * Ingests law documents from docs/RAG-filler/law/ into appropriate RAG collections.
 *
 * Usage: npx ts-node scripts/ingest-law-documents.ts
 *
 * Prerequisites:
 * - Ollama running with nomic-embed-text model
 * - Supabase running locally
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

// Configuration
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}
const DATABASE_URL = process.env.DATABASE_URL;
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = 'nomic-embed-text';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const ORG_SLUG = 'legal';

// Initialize Postgres pool
const pool = new Pool({ connectionString: DATABASE_URL });

// Document to collection mapping
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
    files: [
      'estate-planning/guides/basic-estate-plan-guide.md',
    ],
  },
};


/**
 * Generate embedding using Ollama
 */
async function generateEmbedding(text: string): Promise<{ embedding: number[]; tokenCount: number }> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as { embedding: number[]; prompt_eval_count?: number };

  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error('Invalid embedding response from Ollama');
  }

  return {
    embedding: data.embedding,
    tokenCount: data.prompt_eval_count || Math.ceil(text.length / 4),
  };
}

/**
 * Check if Ollama is available
 */
async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;

    const data = await response.json() as { models: Array<{ name: string }> };
    const hasModel = data.models?.some(m =>
      m.name === EMBEDDING_MODEL || m.name.startsWith(`${EMBEDDING_MODEL}:`)
    );

    if (!hasModel) {
      console.error(`Model ${EMBEDDING_MODEL} not found. Run: ollama pull ${EMBEDDING_MODEL}`);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Split text into chunks with overlap
 */
function chunkText(text: string, chunkSize: number, overlap: number): Array<{ content: string; charOffset: number }> {
  const chunks: Array<{ content: string; charOffset: number }> = [];

  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  let currentOffset = 0;
  let chunkStartOffset = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({ content: currentChunk.trim(), charOffset: chunkStartOffset });

      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentChunk.length - overlap);
      currentChunk = currentChunk.slice(overlapStart) + '\n\n' + para;
      chunkStartOffset = currentOffset - (currentChunk.length - para.length - 2);
    } else {
      if (currentChunk.length === 0) {
        chunkStartOffset = currentOffset;
      }
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + para;
    }
    currentOffset += para.length + 2;
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({ content: currentChunk.trim(), charOffset: chunkStartOffset });
  }

  return chunks;
}

/**
 * Get collection by slug
 */
async function getCollection(slug: string): Promise<{ id: string; name: string } | null> {
  try {
    const result = await pool.query(
      'SELECT id, name FROM rag_data.rag_collections WHERE slug = $1 AND organization_slug = $2',
      [slug, ORG_SLUG]
    );

    if (result.rows.length === 0) {
      console.error(`Collection not found: ${slug}`);
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error(`Error getting collection ${slug}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Create document record
 */
async function createDocument(
  collectionId: string,
  filename: string,
  content: string,
  sourcePath: string,
): Promise<string> {
  const fileHash = crypto.createHash('sha256').update(content).digest('hex');
  const metadata = JSON.stringify({
    sourcePath: `docs/RAG-filler/law/${sourcePath}`,
    title: filename.replace('.md', '').replace(/-/g, ' '),
  });

  const result = await pool.query(
    `INSERT INTO rag_data.rag_documents
     (collection_id, organization_slug, filename, file_type, file_size, file_hash, status, content, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [collectionId, ORG_SLUG, filename, 'md', Buffer.byteLength(content, 'utf8'), fileHash, 'processing', content, metadata]
  );

  return result.rows[0].id;
}

/**
 * Insert chunks for a document
 */
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
      [documentId, collectionId, ORG_SLUG, chunk.content, i, embeddingStr, chunk.tokenCount, chunk.charOffset, '{}']
    );
  }

  return chunks.length;
}

/**
 * Update document status
 */
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
    [status, chunkCount, tokenCount, documentId]
  );
}

/**
 * Update collection counts
 */
async function updateCollectionCounts(collectionId: string): Promise<void> {
  const result = await pool.query(
    `SELECT COUNT(*) as doc_count,
            COALESCE(SUM(chunk_count), 0) as chunk_count,
            COALESCE(SUM(token_count), 0) as total_tokens
     FROM rag_data.rag_documents
     WHERE collection_id = $1 AND status = 'completed'`,
    [collectionId]
  );

  const { doc_count, chunk_count, total_tokens } = result.rows[0];

  await pool.query(
    `UPDATE rag_data.rag_collections
     SET document_count = $1, chunk_count = $2, total_tokens = $3
     WHERE id = $4`,
    [parseInt(doc_count), parseInt(chunk_count), parseInt(total_tokens), collectionId]
  );
}

/**
 * Process a single file
 */
async function processFile(
  collectionId: string,
  collectionName: string,
  filePath: string,
  basePath: string,
): Promise<{ success: boolean; chunks: number; tokens: number }> {
  const fullPath = path.join(basePath, filePath);
  const filename = path.basename(filePath);

  console.log(`  Processing: ${filename}`);

  try {
    // Read file content
    const content = fs.readFileSync(fullPath, 'utf8');

    // Create document record
    const documentId = await createDocument(collectionId, filename, content, filePath);

    // Chunk the text
    const textChunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`    Created ${textChunks.length} chunks`);

    // Generate embeddings for each chunk
    const chunksWithEmbeddings: Array<{
      content: string;
      charOffset: number;
      embedding: number[];
      tokenCount: number;
    }> = [];

    let totalTokens = 0;
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      process.stdout.write(`    Embedding chunk ${i + 1}/${textChunks.length}\r`);

      const { embedding, tokenCount } = await generateEmbedding(chunk.content);
      chunksWithEmbeddings.push({
        ...chunk,
        embedding,
        tokenCount,
      });
      totalTokens += tokenCount;
    }
    console.log(`    Generated embeddings (${totalTokens} tokens)`);

    // Insert chunks
    const insertedCount = await insertChunks(documentId, collectionId, chunksWithEmbeddings);

    // Update document status
    await updateDocumentStatus(documentId, 'completed', insertedCount, totalTokens);

    console.log(`    ✓ Completed: ${insertedCount} chunks, ${totalTokens} tokens`);
    return { success: true, chunks: insertedCount, tokens: totalTokens };

  } catch (error) {
    console.error(`    ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, chunks: 0, tokens: 0 };
  }
}

/**
 * Main ingestion function
 */
async function main(): Promise<void> {
  console.log('=== Law Documents Ingestion Script ===\n');

  // Check Ollama
  console.log('Checking Ollama...');
  const ollamaReady = await checkOllama();
  if (!ollamaReady) {
    console.error('\n❌ Ollama is not available. Please:');
    console.error('   1. Start Ollama: ollama serve');
    console.error(`   2. Pull the model: ollama pull ${EMBEDDING_MODEL}`);
    process.exit(1);
  }
  console.log('✓ Ollama ready\n');

  const basePath = path.resolve(process.cwd(), 'docs/RAG-filler/law');

  let totalDocs = 0;
  let totalChunks = 0;
  let totalTokens = 0;
  let failedDocs = 0;

  // Process each collection
  for (const [collectionKey, config] of Object.entries(COLLECTION_MAPPING)) {
    console.log(`\n📁 Collection: ${collectionKey}`);

    const collection = await getCollection(config.slug);
    if (!collection) {
      console.error(`   ❌ Collection not found: ${config.slug}`);
      continue;
    }

    console.log(`   ID: ${collection.id}`);

    // Process each file
    for (const file of config.files) {
      const result = await processFile(collection.id, collection.name, file, basePath);
      if (result.success) {
        totalDocs++;
        totalChunks += result.chunks;
        totalTokens += result.tokens;
      } else {
        failedDocs++;
      }
    }

    // Update collection counts
    await updateCollectionCounts(collection.id);
  }

  console.log('\n=== Summary ===');
  console.log(`Documents processed: ${totalDocs}`);
  console.log(`Documents failed: ${failedDocs}`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`Total tokens: ${totalTokens}`);
  console.log('\n✓ Ingestion complete!');

  // Close database connection
  await pool.end();
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

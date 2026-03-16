/**
 * Direct ingestion of legal documents into Azure SQL Server.
 * Bypasses the API (no auth needed) — reads files, chunks, embeds via Ollama,
 * and inserts directly into rag_data tables.
 */
const mssql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

dotenv.config({ path: path.join(process.cwd(), '../../.env.azure') });
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = 'nomic-embed-text';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const DOCS_BASE = path.join(process.cwd(), '../../docs/RAG-filler/law');

// Collection slug -> file paths
const COLLECTIONS = {
  'law-firm-policies-attributed': [
    'firm-policies/billing/fee-agreement-policy.md',
    'firm-policies/ethics/client-confidentiality-policy.md',
    'firm-policies/ethics/conflict-of-interest-policy.md',
    'firm-policies/operations/file-retention-policy.md',
  ],
  'law-contracts-hybrid': [
    'contracts/templates/standard-nda-template.md',
    'contracts/templates/engagement-letter-template.md',
    'contracts/templates/master-services-agreement.md',
    'contracts/clause-library/master-clause-library.md',
  ],
  'law-litigation-cross-reference': [
    'litigation/motions/motion-to-dismiss-checklist.md',
    'litigation/discovery/written-discovery-checklist.md',
    'litigation/discovery/deposition-checklist.md',
    'litigation/trial-prep/trial-preparation-checklist.md',
  ],
  'law-client-intake-temporal': [
    'client-intake/checklists/personal-injury-intake-checklist.md',
    'client-intake/checklists/personal-injury-intake-checklist-v2.md',
  ],
  'law-estate-planning-attributed': [
    'estate-planning/guides/basic-estate-plan-guide.md',
  ],
};

// Simple recursive text splitter
function chunkText(text, chunkSize, chunkOverlap) {
  const separators = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''];
  const chunks = [];

  function split(text, seps) {
    if (text.length <= chunkSize) {
      if (text.trim()) chunks.push(text.trim());
      return;
    }
    const sep = seps[0];
    const remainingSeps = seps.slice(1);

    if (!sep && sep !== '') {
      // Last resort: hard split
      for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        const chunk = text.slice(i, i + chunkSize).trim();
        if (chunk) chunks.push(chunk);
      }
      return;
    }

    const parts = sep === '' ? text.split('') : text.split(sep);
    let current = '';

    for (const part of parts) {
      const addition = current ? sep + part : part;
      if ((current + addition).length > chunkSize && current.trim()) {
        chunks.push(current.trim());
        // Overlap: keep end of current chunk
        const overlapText = current.slice(-chunkOverlap);
        current = overlapText + (sep === '' ? '' : sep) + part;
      } else {
        current = current ? current + sep + part : part;
      }
    }
    if (current.trim()) {
      if (current.length > chunkSize && remainingSeps.length > 0) {
        split(current, remainingSeps);
      } else {
        chunks.push(current.trim());
      }
    }
  }

  split(text, separators);
  return chunks;
}

// Generate embedding via Ollama
async function getEmbedding(text) {
  const resp = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!resp.ok) throw new Error(`Ollama embed failed: ${resp.status}`);
  const data = await resp.json();
  return data.embeddings[0]; // array of floats
}

// Simple token estimate (chars / 4)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

async function run() {
  const pool = await new mssql.ConnectionPool({
    server: process.env.SQLSERVER_HOST,
    port: parseInt(process.env.SQLSERVER_PORT, 10),
    database: process.env.SQLSERVER_DATABASE,
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    connectionTimeout: 30000,
    requestTimeout: 120000,
    options: {
      encrypt: process.env.SQLSERVER_ENCRYPT === 'true',
      trustServerCertificate: (process.env.SQLSERVER_TRUST_SERVER_CERT || 'false') === 'true',
    },
  }).connect();

  try {
    // Get collection IDs
    const colResult = await pool.request().query(
      `SELECT id, slug FROM rag_data.rag_collections WHERE organization_slug = 'legal'`
    );
    const collectionMap = {};
    for (const r of colResult.recordset) {
      collectionMap[r.slug] = r.id;
    }
    console.log('Collections found:', Object.keys(collectionMap).join(', '));

    let totalDocs = 0;
    let totalChunks = 0;

    for (const [collSlug, files] of Object.entries(COLLECTIONS)) {
      const collId = collectionMap[collSlug];
      if (!collId) {
        console.error(`Collection not found: ${collSlug}`);
        continue;
      }
      console.log(`\n=== ${collSlug} (${files.length} files) ===`);

      for (const relPath of files) {
        const filePath = path.join(DOCS_BASE, relPath);
        const filename = path.basename(filePath);

        if (!fs.existsSync(filePath)) {
          console.error(`  File not found: ${filePath}`);
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const fileSize = Buffer.byteLength(content, 'utf-8');
        const fileHash = crypto.createHash('sha256').update(content).digest('hex');

        // Check if document already exists (by hash)
        const existing = await pool.request()
          .input('hash', mssql.NVarChar, fileHash)
          .input('collId', mssql.UniqueIdentifier, collId)
          .query(`SELECT id FROM rag_data.rag_documents WHERE file_hash = @hash AND collection_id = @collId`);

        if (existing.recordset.length > 0) {
          console.log(`  SKIP (already exists): ${filename}`);
          continue;
        }

        // Insert document
        const docInsert = await pool.request()
          .input('collId', mssql.UniqueIdentifier, collId)
          .input('org', mssql.NVarChar, 'legal')
          .input('filename', mssql.NVarChar, filename)
          .input('fileType', mssql.NVarChar, 'md')
          .input('fileSize', mssql.Int, fileSize)
          .input('fileHash', mssql.NVarChar, fileHash)
          .input('content', mssql.NVarChar(mssql.MAX), content)
          .input('status', mssql.NVarChar, 'processing')
          .query(`
            INSERT INTO rag_data.rag_documents
              (collection_id, organization_slug, filename, file_type, file_size, file_hash, content, status)
            OUTPUT INSERTED.id
            VALUES (@collId, @org, @filename, @fileType, @fileSize, @fileHash, @content, @status)
          `);
        const docId = docInsert.recordset[0].id;

        // Chunk the content
        const chunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);
        console.log(`  ${filename}: ${chunks.length} chunks, generating embeddings...`);

        let insertedChunks = 0;
        let totalTokenCount = 0;

        for (let i = 0; i < chunks.length; i++) {
          const chunkContent = chunks[i];
          const tokenCount = estimateTokens(chunkContent);
          totalTokenCount += tokenCount;

          // Get embedding from Ollama
          let embedding = null;
          try {
            embedding = await getEmbedding(chunkContent);
          } catch (e) {
            console.error(`    Embedding failed for chunk ${i}: ${e.message}`);
          }

          // Find char offset
          const charOffset = content.indexOf(chunkContent.substring(0, 50));

          const embeddingJson = embedding ? JSON.stringify(embedding) : null;
          await pool.request()
            .input('docId', mssql.UniqueIdentifier, docId)
            .input('collId', mssql.UniqueIdentifier, collId)
            .input('org', mssql.NVarChar, 'legal')
            .input('content', mssql.NVarChar(mssql.MAX), chunkContent)
            .input('chunkIndex', mssql.Int, i)
            .input('embedding', mssql.NVarChar(mssql.MAX), embeddingJson)
            .input('tokenCount', mssql.Int, tokenCount)
            .input('charOffset', mssql.Int, charOffset >= 0 ? charOffset : null)
            .input('metadata', mssql.NVarChar(mssql.MAX), '{}')
            .query(`
              INSERT INTO rag_data.rag_document_chunks
                (document_id, collection_id, organization_slug, content, chunk_index,
                 embedding, token_count, char_offset, metadata)
              VALUES (@docId, @collId, @org, @content, @chunkIndex,
                 @embedding, @tokenCount, @charOffset, @metadata)
            `);
          insertedChunks++;
        }

        // Update document status
        await pool.request()
          .input('docId', mssql.UniqueIdentifier, docId)
          .input('chunkCount', mssql.Int, insertedChunks)
          .input('tokenCount', mssql.Int, totalTokenCount)
          .query(`
            UPDATE rag_data.rag_documents
            SET status = 'completed', chunk_count = @chunkCount, token_count = @tokenCount,
                processed_at = SYSDATETIMEOFFSET()
            WHERE id = @docId
          `);

        // Update collection stats
        await pool.request()
          .input('collId', mssql.UniqueIdentifier, collId)
          .query(`
            UPDATE rag_data.rag_collections
            SET document_count = (SELECT COUNT(*) FROM rag_data.rag_documents WHERE collection_id = @collId),
                chunk_count = (SELECT COUNT(*) FROM rag_data.rag_document_chunks WHERE collection_id = @collId),
                total_tokens = (SELECT ISNULL(SUM(token_count), 0) FROM rag_data.rag_document_chunks WHERE collection_id = @collId),
                updated_at = SYSDATETIMEOFFSET()
            WHERE id = @collId
          `);

        console.log(`  ✓ ${filename}: ${insertedChunks} chunks, ${totalTokenCount} tokens`);
        totalDocs++;
        totalChunks += insertedChunks;
      }
    }

    console.log(`\n========================================`);
    console.log(` Ingestion Complete!`);
    console.log(` Documents: ${totalDocs}`);
    console.log(` Chunks: ${totalChunks}`);
    console.log(`========================================`);

    // Final stats
    const stats = await pool.request().query(`
      SELECT slug, document_count, chunk_count, total_tokens
      FROM rag_data.rag_collections WHERE organization_slug = 'legal' ORDER BY slug
    `);
    console.log('\nCollection stats:');
    for (const r of stats.recordset) {
      console.log(`  ${r.slug}: ${r.document_count} docs, ${r.chunk_count} chunks, ${r.total_tokens} tokens`);
    }

  } finally {
    await pool.close();
  }
}

run().catch(e => { console.error(e); process.exit(1); });

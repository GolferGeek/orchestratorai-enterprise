/**
 * Seed Frameworks — Ingests regulatory framework text into RAG collections.
 *
 * This script reads framework source files from per-framework subdirectories
 * (gdpr/, hipaa/, sox/) and ingests each file as a separate RAG document
 * for fine-grained retrieval.
 *
 * Each file becomes one RAG document. The MetadataEnrichmentService
 * automatically extracts front-matter (Document ID, Framework, Related
 * Documents, etc.) during the chunking/embedding pipeline.
 *
 * Usage:
 *   Called programmatically from the compliance-audit module on startup:
 *   await seedFrameworks(ragStorage, documentProcessor, orgSlug);
 *
 * Prerequisites:
 *   - RAG collections must exist (run the seed migration first)
 *   - Database must be running
 */
import * as fs from 'fs';
import * as path from 'path';
import type { RagStorageService } from '@orchestratorai/planes/rag';
import type { DocumentProcessorService } from '@orchestratorai/planes/rag';

interface FrameworkSource {
  slug: string;
  directory: string;
  name: string;
}

const FRAMEWORK_SOURCES: FrameworkSource[] = [
  {
    slug: 'framework-gdpr',
    directory: 'gdpr',
    name: 'GDPR (EU General Data Protection Regulation)',
  },
  {
    slug: 'framework-hipaa',
    directory: 'hipaa',
    name: 'HIPAA (Health Insurance Portability and Accountability Act)',
  },
  {
    slug: 'framework-sox',
    directory: 'sox',
    name: 'SOX (Sarbanes-Oxley Act)',
  },
];

/**
 * Lists all .md files in a framework subdirectory.
 */
function listFrameworkFiles(directory: string): string[] {
  const dirPath = path.join(
    process.cwd(),
    'src/agents/legal-department/workflows/compliance-audit/framework-sources',
    directory,
  );
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => path.join(dirPath, f));
}

/**
 * Extracts a title from the first markdown heading in the file content.
 * Falls back to the filename if no heading is found.
 */
function extractTitle(content: string, filename: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  return headingMatch ? headingMatch[1]!.trim() : filename.replace('.md', '');
}

/**
 * Seeds a single framework RAG collection with its source files.
 * Each .md file in the framework subdirectory becomes a separate
 * RAG document for fine-grained retrieval.
 */
export async function seedFramework(
  ragStorage: RagStorageService,
  documentProcessor: DocumentProcessorService,
  orgSlug: string,
  source: FrameworkSource,
): Promise<{ documentsIngested: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let skipped = 0;

  // List source files
  const files = listFrameworkFiles(source.directory);

  if (files.length === 0) {
    errors.push(`No .md files found in framework-sources/${source.directory}/`);
    return { documentsIngested: 0, skipped: 0, errors };
  }

  // Find the collection
  const collection = await ragStorage.getCollectionBySlug(
    source.slug,
    orgSlug,
  );
  if (!collection) {
    errors.push(
      `Collection ${source.slug} not found for org ${orgSlug}. Run the seed migration first.`,
    );
    return { documentsIngested: 0, skipped: 0, errors };
  }

  // Check existing document count to avoid re-seeding
  const existingDocs = await ragStorage.getDocuments(collection.id, orgSlug);
  if (existingDocs && existingDocs.length >= files.length) {
    return { documentsIngested: 0, skipped: files.length, errors: [] };
  }

  // Build a set of existing filenames to skip duplicates
  const existingFilenames = new Set(
    (existingDocs ?? []).map((d: { filename: string }) => d.filename),
  );

  let documentsIngested = 0;

  for (const filePath of files) {
    const filename = path.basename(filePath);

    // Skip if already ingested
    if (existingFilenames.has(filename)) {
      skipped++;
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const title = extractTitle(content, filename);

      // Insert document into collection
      const doc = await ragStorage.insertDocument(collection.id, orgSlug, {
        filename,
        fileType: 'text/markdown',
        fileSize: Buffer.byteLength(content, 'utf-8'),
        fileHash: null,
        storagePath: null,
        createdBy: '00000000-0000-0000-0000-000000000000',
        content,
      });

      // Process the document (chunk, enrich metadata, embed, store)
      // DocumentProcessorService.extractText() switches on extension ('md'), not MIME type
      await documentProcessor.processDocument(
        doc.id,
        orgSlug,
        collection.id,
        Buffer.from(content, 'utf-8'),
        'md',
        title,
      );

      documentsIngested++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to ingest "${filename}": ${msg}`);
    }
  }

  return { documentsIngested, skipped, errors };
}

/**
 * Seeds all framework RAG collections.
 * Idempotent — skips documents that are already ingested.
 */
export async function seedFrameworks(
  ragStorage: RagStorageService,
  documentProcessor: DocumentProcessorService,
  orgSlug: string,
): Promise<{
  total: number;
  skipped: number;
  errors: string[];
  perFramework: Record<string, { ingested: number; skipped: number }>;
}> {
  let total = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];
  const perFramework: Record<string, { ingested: number; skipped: number }> =
    {};

  for (const source of FRAMEWORK_SOURCES) {
    const result = await seedFramework(
      ragStorage,
      documentProcessor,
      orgSlug,
      source,
    );
    total += result.documentsIngested;
    totalSkipped += result.skipped;
    perFramework[source.slug] = {
      ingested: result.documentsIngested,
      skipped: result.skipped,
    };
    allErrors.push(...result.errors);
  }

  return { total, skipped: totalSkipped, errors: allErrors, perFramework };
}

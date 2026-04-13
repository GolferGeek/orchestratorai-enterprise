/**
 * Seed Frameworks — Ingests regulatory framework text into RAG collections.
 *
 * This script reads the framework source files (gdpr-articles.md, hipaa-rules.md,
 * sox-sections.md) and ingests them into the corresponding RAG collections that
 * were created by the seed migration (20260413000001).
 *
 * Usage:
 *   npx ts-node src/agents/legal-department/workflows/compliance-audit/seed-frameworks.ts
 *
 * Or called programmatically:
 *   import { seedFrameworks } from './seed-frameworks';
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
  filename: string;
  name: string;
}

const FRAMEWORK_SOURCES: FrameworkSource[] = [
  {
    slug: 'framework-gdpr',
    filename: 'gdpr-articles.md',
    name: 'GDPR — General Data Protection Regulation',
  },
  {
    slug: 'framework-hipaa',
    filename: 'hipaa-rules.md',
    name: 'HIPAA — Health Insurance Portability and Accountability Act',
  },
  {
    slug: 'framework-sox',
    filename: 'sox-sections.md',
    name: 'SOX — Sarbanes-Oxley Act',
  },
];

/**
 * Parses a framework source markdown file into sections split at `---` boundaries.
 * Each section becomes a separate document in the RAG collection for optimal
 * retrieval granularity.
 */
export function parseFrameworkSections(
  content: string,
  frameworkName: string,
): Array<{ title: string; text: string }> {
  const sections: Array<{ title: string; text: string }> = [];

  // Split by horizontal rule (---) which separates each article/rule/section
  const rawSections = content.split(/\n---\n/).filter((s) => s.trim());

  for (const raw of rawSections) {
    // Extract the first ## heading as title
    const headingMatch = raw.match(/^##\s+(.+)$/m);
    const title = headingMatch
      ? headingMatch[1]!.trim()
      : `${frameworkName} Section`;

    const text = raw.trim();
    if (text.length > 50) {
      // Skip very short sections (headers, metadata)
      sections.push({ title, text });
    }
  }

  return sections;
}

/**
 * Seeds a single framework RAG collection with its source text.
 * Each article/rule/section becomes a separate document for fine-grained retrieval.
 */
export async function seedFramework(
  ragStorage: RagStorageService,
  documentProcessor: DocumentProcessorService,
  orgSlug: string,
  source: FrameworkSource,
): Promise<{ documentsIngested: number; errors: string[] }> {
  const errors: string[] = [];

  // Read source file
  const sourcePath = path.join(__dirname, 'framework-sources', source.filename);
  const content = fs.readFileSync(sourcePath, 'utf-8');

  // Parse into sections
  const sections = parseFrameworkSections(content, source.name);

  if (sections.length === 0) {
    errors.push(`No sections found in ${source.filename}`);
    return { documentsIngested: 0, errors };
  }

  // Find the collection
  const collection = await ragStorage.getCollectionBySlug(source.slug, orgSlug);
  if (!collection) {
    errors.push(
      `Collection ${source.slug} not found for org ${orgSlug}. Run the seed migration first.`,
    );
    return { documentsIngested: 0, errors };
  }

  let documentsIngested = 0;

  for (const section of sections) {
    try {
      // Insert document into collection
      const doc = await ragStorage.insertDocument(collection.id, orgSlug, {
        filename: section.title,
        fileType: 'text/markdown',
        fileSize: Buffer.byteLength(section.text, 'utf-8'),
        fileHash: null,
        storagePath: null,
        createdBy: 'system',
        content: section.text,
      });

      // Process the document (chunk, embed, store)
      await documentProcessor.processDocument(
        doc.id,
        orgSlug,
        collection.id,
        Buffer.from(section.text, 'utf-8'),
        'text/markdown',
        section.title,
      );

      documentsIngested++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to ingest "${section.title}": ${msg}`);
    }
  }

  return { documentsIngested, errors };
}

/**
 * Seeds all framework RAG collections.
 */
export async function seedFrameworks(
  ragStorage: RagStorageService,
  documentProcessor: DocumentProcessorService,
  orgSlug: string,
): Promise<{
  total: number;
  errors: string[];
  perFramework: Record<string, number>;
}> {
  let total = 0;
  const allErrors: string[] = [];
  const perFramework: Record<string, number> = {};

  for (const source of FRAMEWORK_SOURCES) {
    const result = await seedFramework(
      ragStorage,
      documentProcessor,
      orgSlug,
      source,
    );
    total += result.documentsIngested;
    perFramework[source.slug] = result.documentsIngested;
    allErrors.push(...result.errors);
  }

  return { total, errors: allErrors, perFramework };
}

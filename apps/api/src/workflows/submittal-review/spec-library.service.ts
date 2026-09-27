import { Inject, Injectable } from '@nestjs/common';
import { RAG_STORAGE_SERVICE, type RagStorageService } from '@orchestratorai/planes/rag';

/** The project manual's collection in the building org's knowledge base. */
export const SPEC_COLLECTION = 'building-specs';

export interface SpecSection {
  /** "23 74 13" */
  section: string;
  title: string;
  documentId: string;
}

/** "23-74-13-rooftop-units.md" -> "23 74 13" */
const sectionOf = (filename: string) => /^(\d{2})-(\d{2})-(\d{2})/.exec(filename)?.slice(1, 4).join(' ') ?? null;

/**
 * The project specification sections, read from the RAG plane: each section
 * is one document of the building-specs collection, named by its number.
 */
@Injectable()
export class SpecLibraryService {
  constructor(@Inject(RAG_STORAGE_SERVICE) private readonly rag: RagStorageService) {}

  async sections(organizationSlug: string): Promise<SpecSection[]> {
    const collection = await this.rag.getCollectionBySlug(SPEC_COLLECTION, organizationSlug);
    if (!collection) throw new Error(`The ${organizationSlug} knowledge base has no ${SPEC_COLLECTION} collection`);
    const documents = await this.rag.getDocuments(collection.id, organizationSlug);
    const sections: SpecSection[] = [];
    for (const d of documents) {
      const section = sectionOf(d.filename);
      if (!section || d.status !== 'completed') continue;
      const title = d.filename.replace(/^\d{2}-\d{2}-\d{2}-/, '').replace(/\.md$/, '').replace(/-/g, ' ');
      sections.push({ section, title, documentId: d.id });
    }
    return sections.sort((a, b) => a.section.localeCompare(b.section));
  }

  /** The section's text: its chunks in order. */
  async text(organizationSlug: string, section: string): Promise<string> {
    const found = (await this.sections(organizationSlug)).find((s) => s.section === section);
    if (!found) throw new Error(`The project manual has no section ${section}`);
    const chunks = await this.rag.getDocumentChunks(found.documentId, organizationSlug);
    if (chunks.length === 0) throw new Error(`Section ${section} has no text in the knowledge base`);
    return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex).map((c) => c.content).join('\n');
  }
}

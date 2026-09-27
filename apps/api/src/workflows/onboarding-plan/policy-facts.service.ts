import { Inject, Injectable } from '@nestjs/common';
import { EMBEDDING_SERVICE, RAG_STORAGE_SERVICE, type EmbeddingServiceProvider, type RagStorageService } from '@orchestratorai/planes/rag';

export const POLICY_COLLECTION = 'hr-policy';

/** What the planner needs to know from policy, asked of HR's knowledge base. */
export const POLICY_QUESTIONS = [
  'first day and first week onboarding for new employees',
  'benefits enrollment deadline for new hires',
  'required trainings and compliance courses for new employees',
  'laptop, equipment and accounts provided to new employees',
  'probation or introductory period and check-ins',
];

export interface PolicyFact {
  source: string;
  text: string;
}

/**
 * Facts from HR's policy library (the hr-policy RAG collection) for an
 * onboarding plan: each question is embedded and searched through the RAG
 * plane; duplicates are dropped.
 */
@Injectable()
export class PolicyFactsService {
  constructor(
    @Inject(RAG_STORAGE_SERVICE) private readonly rag: RagStorageService,
    @Inject(EMBEDDING_SERVICE) private readonly embeddings: EmbeddingServiceProvider,
  ) {}

  async facts(organizationSlug: string): Promise<PolicyFact[]> {
    const collection = await this.rag.getCollectionBySlug(POLICY_COLLECTION, organizationSlug);
    if (!collection) throw new Error(`The ${organizationSlug} knowledge base has no ${POLICY_COLLECTION} collection`);
    const seen = new Set<string>();
    const facts: PolicyFact[] = [];
    for (const question of POLICY_QUESTIONS) {
      const embedding = await this.embeddings.embed(question, collection.embeddingModel);
      for (const hit of await this.rag.vectorSearch(collection.id, organizationSlug, embedding, 2, 0.3)) {
        if (seen.has(hit.chunkId)) continue;
        seen.add(hit.chunkId);
        facts.push({ source: hit.documentFilename, text: hit.content });
      }
    }
    return facts;
  }
}

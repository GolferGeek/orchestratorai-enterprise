import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * A single RAG search result returned by the internal API endpoint
 */
export interface RagSearchResult {
  documentId: string;
  content: string;
  score: number;
  section?: string;
  pageNumber?: number | null;
}

/**
 * Parameters for querying a RAG collection
 */
export interface RagQueryParams {
  collectionSlug: string;
  orgSlug: string;
  query: string;
  topK?: number;
  similarityThreshold?: number;
}

/**
 * RagHttpClientService
 *
 * Calls the API's internal RAG query endpoint:
 *   POST http://{apiHost}:{apiPort}/rag/internal/query
 *
 * This is a service-to-service call — no JWT required.
 * Modelled after LLMHttpClientService.
 */
@Injectable()
export class RagHttpClientService {
  private readonly logger = new Logger(RagHttpClientService.name);
  private readonly ragServiceUrl: string;
  private readonly ragEndpoint = '/rag/internal/query';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Fail fast if required configuration is missing — no defaults allowed
    const apiPort = this.configService.get<string>('API_PORT');
    if (!apiPort) {
      throw new Error(
        'API_PORT environment variable is required. ' +
          'Please set API_PORT in your .env file (e.g., API_PORT=6100). ' +
          'This must be explicitly configured for your environment.',
      );
    }

    // API_HOST has a stable default but can be overridden
    const apiHost = this.configService.get<string>('API_HOST') || 'localhost';

    this.ragServiceUrl = `http://${apiHost}:${apiPort}`;

    this.logger.log(
      `RAG HTTP Client configured: ${this.ragServiceUrl}${this.ragEndpoint} (API_PORT=${apiPort}, API_HOST=${apiHost})`,
    );
  }

  /**
   * Query a RAG collection via the internal API endpoint.
   *
   * Returns an array of search results ordered by relevance score.
   * Throws if the HTTP call fails — no fallbacks.
   */
  async queryCollection(params: RagQueryParams): Promise<RagSearchResult[]> {
    const url = `${this.ragServiceUrl}${this.ragEndpoint}`;

    this.logger.debug(`Calling RAG internal query: ${url}`, {
      collectionSlug: params.collectionSlug,
      orgSlug: params.orgSlug,
      topK: params.topK,
    });

    const response = await firstValueFrom(
      this.httpService.post<{ results: RagSearchResult[] }>(url, {
        collectionSlug: params.collectionSlug,
        orgSlug: params.orgSlug,
        query: params.query,
        topK: params.topK,
        similarityThreshold: params.similarityThreshold,
      }),
    );

    return response.data.results;
  }
}

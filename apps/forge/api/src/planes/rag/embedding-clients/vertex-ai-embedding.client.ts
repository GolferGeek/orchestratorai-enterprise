/**
 * Vertex AI Embedding Client
 *
 * Generates embeddings via Vertex AI's text-embedding predict endpoint.
 * Uses Application Default Credentials (ADC) for authentication.
 *
 * Env: GCP_PROJECT_ID, GCP_REGION (default: us-central1)
 * Auth: GOOGLE_APPLICATION_CREDENTIALS or workload identity
 */
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingResult } from '../embedding.interface';

interface VertexEmbeddingResponse {
  predictions: Array<{
    embeddings: {
      values: number[];
      statistics: {
        token_count: number;
        truncated: boolean;
      };
    };
  }>;
}

@Injectable()
export class VertexAIEmbeddingClient {
  private readonly logger = new Logger(VertexAIEmbeddingClient.name);

  private getProjectId(): string {
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        'GCP_PROJECT_ID is not set. Required for Vertex AI embedding models.',
      );
    }
    return projectId;
  }

  private getRegion(): string {
    return process.env.GCP_REGION || 'us-central1';
  }

  private async getAccessToken(): Promise<string> {
    // Use Google Cloud metadata server for workload identity (Cloud Run)
    // or fall back to gcloud CLI for local dev
    const metadataUrl =
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

    try {
      const response = await fetch(metadataUrl, {
        headers: { 'Metadata-Flavor': 'Google' },
      });

      if (response.ok) {
        const data = (await response.json()) as { access_token: string };
        return data.access_token;
      }
    } catch {
      // Not running on GCP — try gcloud CLI
    }

    // Fall back to gcloud CLI (for local development)
    const { execSync } = await import('child_process');
    try {
      const token = execSync('gcloud auth print-access-token', {
        encoding: 'utf-8',
        timeout: 10_000,
      }).trim();
      return token;
    } catch {
      throw new Error(
        'Cannot obtain GCP access token. Set GOOGLE_APPLICATION_CREDENTIALS or run: gcloud auth login',
      );
    }
  }

  async embed(text: string, model: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text], model);
    return results[0]!;
  }

  async embedBatch(texts: string[], model: string): Promise<EmbeddingResult[]> {
    const projectId = this.getProjectId();
    const region = this.getRegion();
    const accessToken = await this.getAccessToken();

    // Vertex AI supports up to 250 instances per request
    const batchSize = 250;
    const allResults: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const results = await this.embedBatchInternal(
        batch,
        model,
        projectId,
        region,
        accessToken,
      );
      allResults.push(...results);

      if (texts.length > 250 && i > 0) {
        this.logger.debug(
          `Vertex AI embedding progress: ${Math.min(i + batchSize, texts.length)}/${texts.length}`,
        );
      }
    }

    return allResults;
  }

  private async embedBatchInternal(
    texts: string[],
    model: string,
    projectId: string,
    region: string,
    accessToken: string,
  ): Promise<EmbeddingResult[]> {
    const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:predict`;

    const instances = texts.map((text) => ({
      content: text,
      task_type: 'RETRIEVAL_DOCUMENT',
    }));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instances }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Vertex AI embedding error: ${response.status} - ${errorText}`,
      );
    }

    const data = (await response.json()) as VertexEmbeddingResponse;

    if (!data.predictions || !Array.isArray(data.predictions)) {
      throw new Error('Invalid embedding response from Vertex AI');
    }

    return data.predictions.map((prediction) => ({
      embedding: prediction.embeddings.values,
      tokenCount: prediction.embeddings.statistics.token_count,
    }));
  }

  async checkHealth(
    model: string,
  ): Promise<{ status: string; message: string }> {
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        `GCP_PROJECT_ID not set — cannot use Vertex AI embedding model '${model}'`,
      );
    }

    // Try to get an access token to verify auth
    await this.getAccessToken();

    return {
      status: 'ok',
      message: `Vertex AI embedding model '${model}' available (project: ${projectId})`,
    };
  }
}

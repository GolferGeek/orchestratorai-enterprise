import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * LLM usage data for reporting
 */
export interface LLMUsageData {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  userId: string;
  callerType: 'langgraph-tool' | 'langgraph-workflow';
  callerName: string;
  conversationId?: string;
  threadId?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * LLMUsageReporterService
 *
 * Reports LLM usage to the Orchestrator AI API for tracking and billing.
 *
 * This is used when tools call specialized LLMs directly (e.g., Ollama/SQLCoder)
 * rather than going through the central /llm/generate endpoint.
 *
 * Usage:
 * - Tools that use Ollama or other direct LLM calls should report usage here
 * - Traditional LLM calls through LLMHttpClientService already track usage
 */
@Injectable()
export class LLMUsageReporterService {
  private readonly logger = new Logger(LLMUsageReporterService.name);
  private readonly apiBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const apiPort = this.configService.get<string>('API_PORT');
    if (!apiPort) {
      throw new Error(
        'API_PORT environment variable is required. ' +
          'Please set API_PORT in your .env file (e.g., API_PORT=6100).',
      );
    }

    const apiHost = this.configService.get<string>('API_HOST') || 'localhost';
    this.apiBaseUrl = `http://${apiHost}:${apiPort}`;
  }

  /**
   * Report LLM usage to the Orchestrator AI API
   * Non-blocking - failures are logged but don't throw
   */
  async reportUsage(usage: LLMUsageData): Promise<void> {
    try {
      const url = `${this.apiBaseUrl}/llm/usage`;

      const payload = {
        provider: usage.provider,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        userId: usage.userId,
        callerType: usage.callerType,
        callerName: usage.callerName,
        conversationId: usage.conversationId,
        threadId: usage.threadId,
        latencyMs: usage.latencyMs,
        timestamp: new Date().toISOString(),
        metadata: usage.metadata,
      };

      this.logger.debug(
        `Reporting LLM usage: ${usage.provider}/${usage.model}`,
        {
          totalTokens: usage.totalTokens,
          callerName: usage.callerName,
        },
      );

      await firstValueFrom(
        this.httpService.post(url, payload, {
          timeout: 2000, // 2 second timeout - don't block
          validateStatus: () => true, // Accept any status
        }),
      );
    } catch (error) {
      // Log but don't throw - usage reporting failures shouldn't break tools
      this.logger.warn(
        `Failed to report LLM usage (non-blocking): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Convenience: Report Ollama usage
   */
  async reportOllamaUsage(params: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    userId: string;
    callerName: string;
    conversationId?: string;
    threadId?: string;
    latencyMs?: number;
  }): Promise<void> {
    await this.reportUsage({
      provider: 'ollama',
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.promptTokens + params.completionTokens,
      userId: params.userId,
      callerType: 'langgraph-tool',
      callerName: params.callerName,
      conversationId: params.conversationId,
      threadId: params.threadId,
      latencyMs: params.latencyMs,
    });
  }

  /**
   * Convenience: Report SQLCoder usage (via Ollama)
   */
  async reportSQLCoderUsage(params: {
    promptTokens: number;
    completionTokens: number;
    userId: string;
    conversationId?: string;
    threadId?: string;
    latencyMs?: number;
  }): Promise<void> {
    await this.reportOllamaUsage({
      model: 'sqlcoder',
      callerName: 'sql-query-tool',
      ...params,
    });
  }

  /**
   * Estimate token count for a string
   * This is a rough estimate - actual token count may vary by model
   */
  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
}

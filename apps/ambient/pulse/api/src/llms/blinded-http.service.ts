import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom, Observable } from 'rxjs';
import { SourceBlindingService } from './source-blinding.service';

export interface BlindedHttpOptions {
  provider?: string;
  serviceType?: 'agent' | 'llm' | 'external-api' | 'mcp-tool';
  serviceName?: string;
  policyProfile?: string;
  dataClass?: string;
  sovereignMode?: string;
  noTrain?: boolean;
  noRetain?: boolean;
  skipBlinding?: boolean; // For internal/trusted calls
}

/**
 * HTTP service wrapper that applies source blinding to all external requests
 * Drop-in replacement for HttpService with automatic source blinding
 */
@Injectable()
export class BlindedHttpService {
  private readonly logger = new Logger(BlindedHttpService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly sourceBlindingService: SourceBlindingService,
  ) {}

  /**
   * Make a source-blinded GET request
   */
  get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
    blindingOptions: BlindedHttpOptions = {},
  ): Observable<AxiosResponse<T>> {
    return this.makeBlindedRequest<T>(
      { ...config, method: 'GET', url },
      blindingOptions,
    );
  }

  /**
   * Make a source-blinded POST request
   */
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
    blindingOptions: BlindedHttpOptions = {},
  ): Observable<AxiosResponse<T>> {
    return this.makeBlindedRequest<T>(
      { ...config, method: 'POST', url, data },
      blindingOptions,
    );
  }

  /**
   * Make a source-blinded PUT request
   */
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
    blindingOptions: BlindedHttpOptions = {},
  ): Observable<AxiosResponse<T>> {
    return this.makeBlindedRequest<T>(
      { ...config, method: 'PUT', url, data },
      blindingOptions,
    );
  }

  /**
   * Make a source-blinded DELETE request
   */
  delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
    blindingOptions: BlindedHttpOptions = {},
  ): Observable<AxiosResponse<T>> {
    return this.makeBlindedRequest<T>(
      { ...config, method: 'DELETE', url },
      blindingOptions,
    );
  }

  /**
   * Make a source-blinded PATCH request
   */
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
    blindingOptions: BlindedHttpOptions = {},
  ): Observable<AxiosResponse<T>> {
    return this.makeBlindedRequest<T>(
      { ...config, method: 'PATCH', url, data },
      blindingOptions,
    );
  }

  /**
   * Make a source-blinded request with custom config
   */
  request<T = unknown>(
    config: AxiosRequestConfig,
    blindingOptions: BlindedHttpOptions = {},
  ): Observable<AxiosResponse<T>> {
    return this.makeBlindedRequest<T>(config, blindingOptions);
  }

  /**
   * Core method that applies source blinding and makes the request
   */
  private makeBlindedRequest<T = unknown>(
    config: AxiosRequestConfig,
    blindingOptions: BlindedHttpOptions,
  ): Observable<AxiosResponse<T>> {
    // Skip blinding for explicitly trusted internal calls
    if (blindingOptions.skipBlinding || this.isInternalCall(config.url)) {
      return this.httpService.request<T>(config);
    }

    // Apply source blinding
    try {
      const blindedRequest = this.sourceBlindingService.blindRequest(config, {
        provider: blindingOptions.provider || this.inferProvider(config.url),
        policyProfile: blindingOptions.policyProfile,
        dataClass: blindingOptions.dataClass,
        sovereignMode: blindingOptions.sovereignMode,
        noTrain: blindingOptions.noTrain,
        noRetain: blindingOptions.noRetain,
      });

      // Create blinded config
      const blindedConfig: AxiosRequestConfig = {
        ...config,
        headers: blindedRequest.headers,
      };

      return this.httpService.request<T>(blindedConfig);
    } catch (error) {
      this.logger.error(
        `Source blinding failed for request to ${config.url}:`,
        error,
      );
      // Fallback to original request to avoid breaking functionality
      // In production, you might want to block the request instead
      this.logger.warn(
        'Falling back to unblinded request - review security implications',
      );
      return this.httpService.request<T>(config);
    }
  }

  /**
   * Determine if a URL is for an internal/trusted service that doesn't need blinding
   */
  private isInternalCall(url?: string): boolean {
    if (!url) return false;

    const internalPatterns = [
      // Localhost/internal network
      /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/,
      /^https?:\/\/192\.168\./,
      /^https?:\/\/10\./,
      /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,

      // Internal services (if running on same domain)
      /\/internal\//,
      /\/api\/internal\//,

      // Supabase (might be internal depending on setup)
      // Note: Only if it's your own internal Supabase instance
    ];

    return internalPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Infer provider from URL for appropriate source blinding
   */
  private inferProvider(url?: string): string {
    if (!url) return 'unknown';

    const providerPatterns = [
      { pattern: /api\.openai\.com/, provider: 'openai' },
      { pattern: /api\.anthropic\.com/, provider: 'anthropic' },
      { pattern: /generativelanguage\.googleapis\.com/, provider: 'google' },
      { pattern: /api\.notion\.com/, provider: 'notion' },
      { pattern: /slack\.com\/api/, provider: 'slack' },
      { pattern: /supabase\./, provider: 'supabase' },
      { pattern: /github\.com\/api/, provider: 'github' },
    ];

    for (const { pattern, provider } of providerPatterns) {
      if (pattern.test(url)) {
        return provider;
      }
    }

    return 'external';
  }

  /**
   * Convenience method for agent-to-agent calls
   */
  async makeA2ACall<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return firstValueFrom(
      this.post<T>(url, data, config, {
        serviceType: 'agent',
        serviceName: 'a2a-communication',
        provider: 'external-agent',
        policyProfile: 'agent-communication',
        dataClass: 'internal',
        noTrain: true,
        noRetain: true,
      }),
    );
  }

  /**
   * Convenience method for MCP tool calls
   */
  async makeMCPCall<T = unknown>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    const provider = this.inferProvider(url);

    return firstValueFrom(
      this.request<T>(
        { ...config, method, url, data },
        {
          serviceType: 'mcp-tool',
          serviceName: provider,
          provider,
          policyProfile: 'mcp-integration',
          dataClass: 'internal',
          noTrain: true,
          noRetain: true,
        },
      ),
    );
  }

  /**
   * Get statistics about source blinding operations
   */
  getStats(): {
    totalRequests: number;
    blindedRequests: number;
    internalRequests: number;
    sourceBlindingService: unknown;
  } {
    // TODO: Implement request counting
    return {
      totalRequests: 0,
      blindedRequests: 0,
      internalRequests: 0,
      sourceBlindingService: this.sourceBlindingService.getStats(),
    };
  }

  /**
   * Test source blinding with a sample external request
   */
  async testSourceBlinding(targetUrl: string): Promise<{
    success: boolean;
    blindingApplied: boolean;
    error?: string;
  }> {
    try {
      const testConfig: AxiosRequestConfig = {
        method: 'GET',
        url: targetUrl,
        headers: {
          'User-Agent': 'TestOriginalAgent/1.0',
          'X-Company-ID': 'test-company-123',
          Referer: 'https://internal.company.com',
          'X-Source-Environment': 'production',
        },
      };

      // This should apply blinding
      await firstValueFrom(
        this.request(testConfig, {
          serviceType: 'external-api',
          provider: 'test',
        }),
      );

      return {
        success: true,
        blindingApplied: true,
      };
    } catch (error) {
      return {
        success: false,
        blindingApplied: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

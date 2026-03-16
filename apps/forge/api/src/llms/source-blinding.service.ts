import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

export interface SourceBlindingConfig {
  stripIdentifyingHeaders: boolean;
  stripReferrer: boolean;
  useCustomUserAgent: boolean;
  customUserAgent: string;
  stripNetworkMetadata: boolean;
  allowedHeaders: string[];
  blockedHeaders: string[];
  proxyConfig?: {
    enabled: boolean;
    host: string;
    port: number;
    protocol: 'http' | 'https';
    auth?: {
      username: string;
      password: string;
    };
  };
}

export interface BlindedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  originalHeaders: Record<string, string>;
  strippedHeaders: string[];
  sourceBlindingApplied: boolean;
}

@Injectable()
export class SourceBlindingService {
  private readonly logger = new Logger(SourceBlindingService.name);

  private readonly config: SourceBlindingConfig = {
    stripIdentifyingHeaders: true,
    stripReferrer: true,
    useCustomUserAgent: true,
    customUserAgent: 'OrchestratorAI/1.0',
    stripNetworkMetadata: true,
    allowedHeaders: [
      // Essential headers for API functionality
      'content-type',
      'content-length',
      'authorization',
      'x-api-key',
      'accept',
      'accept-encoding',
      'cache-control',
      'connection',

      // Privacy/policy headers we want to send
      'x-no-train',
      'x-no-retain',
      'x-policy-profile',
      'x-data-class',
      'x-sovereign-mode',

      // Provider-specific headers
      'anthropic-version',
      'openai-version',
      'openai-beta',

      // Custom orchestrator headers
      'user-agent', // We control this
    ],
    blockedHeaders: [
      // Headers that could identify the source environment
      'host',
      'origin',
      'referer',
      'referrer',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
      'x-real-ip',
      'x-client-ip',
      'cf-connecting-ip',
      'cf-ray',
      'cf-ipcountry',
      'via',
      'forwarded',

      // Request tracing headers that could leak environment info
      'x-request-id',
      'x-trace-id',
      'x-span-id',
      'x-correlation-id',
      'x-session-id',

      // Server/environment identifying headers
      'server',
      'x-powered-by',
      'x-server',
      'x-runtime',
      'x-version',
      'x-environment',
      'x-datacenter',
      'x-region',

      // Browser/client identifying headers
      'sec-fetch-site',
      'sec-fetch-mode',
      'sec-fetch-dest',
      'sec-fetch-user',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
      'dnt',
      'upgrade-insecure-requests',

      // Company/organization specific headers
      'x-company-id',
      'x-tenant-id',
      'x-organization',
      'x-department',
      'x-project',
      'x-application',
    ],
    // Network-level source blinding with proxy/egress control
    proxyConfig: {
      enabled: process.env.SOURCE_BLINDING_PROXY_ENABLED === 'true',
      host: process.env.SOURCE_BLINDING_PROXY_HOST || '',
      port: parseInt(process.env.SOURCE_BLINDING_PROXY_PORT || '0'),
      protocol:
        (process.env.SOURCE_BLINDING_PROXY_PROTOCOL as 'http' | 'https') ||
        'http',
      auth:
        process.env.SOURCE_BLINDING_PROXY_USERNAME &&
        process.env.SOURCE_BLINDING_PROXY_PASSWORD
          ? {
              username: process.env.SOURCE_BLINDING_PROXY_USERNAME,
              password: process.env.SOURCE_BLINDING_PROXY_PASSWORD,
            }
          : undefined,
    },
  };

  constructor(private readonly httpService: HttpService) {
    this.logger.log(
      'SourceBlindingService initialized with complete source blinding',
    );
  }

  /**
   * Apply source blinding to an outbound request
   */
  blindRequest(
    originalConfig: AxiosRequestConfig,
    options: {
      provider: string;
      noTrain?: boolean;
      noRetain?: boolean;
      policyProfile?: string;
      dataClass?: string;
      sovereignMode?: string;
    },
  ): BlindedRequest {
    const originalHeaders = { ...originalConfig.headers } as Record<
      string,
      string
    >;
    const blindedHeaders: Record<string, string> = {};
    const strippedHeaders: string[] = [];

    // Step 1: Start with clean slate - only add explicitly allowed headers
    Object.entries(originalHeaders).forEach(([key, value]) => {
      const normalizedKey = key.toLowerCase();

      if (this.config.allowedHeaders.includes(normalizedKey)) {
        blindedHeaders[key] = value;
      } else if (this.config.blockedHeaders.includes(normalizedKey)) {
        strippedHeaders.push(key);
        this.logger.debug(`Stripped identifying header: ${key}`);
      } else {
        // Log unknown headers for review
        this.logger.warn(
          `Unknown header encountered: ${key} - review for source blinding`,
        );
        strippedHeaders.push(key);
      }
    });

    // Step 2: Set mandatory source-blinding headers
    blindedHeaders['User-Agent'] = this.config.customUserAgent;

    // Step 3: Add privacy policy headers
    blindedHeaders['X-Policy-Profile'] = options.policyProfile || 'standard';
    blindedHeaders['X-Data-Class'] = options.dataClass || 'public';
    blindedHeaders['X-Sovereign-Mode'] = options.sovereignMode || 'false';

    // Step 4: Add no-train/no-retain headers based on provider capabilities
    if (options.noTrain !== false) {
      if (options.provider === 'openai' || options.provider === 'ollama') {
        blindedHeaders['X-No-Train'] = 'true';
      }
    }

    if (options.noRetain && options.provider === 'ollama') {
      blindedHeaders['X-No-Retain'] = 'true';
    }

    // Step 5: Ensure no referrer leakage
    if (blindedHeaders['referer'] || blindedHeaders['referrer']) {
      delete blindedHeaders['referer'];
      delete blindedHeaders['referrer'];
      strippedHeaders.push('referer', 'referrer');
    }

    return {
      url: originalConfig.url || '',
      method: originalConfig.method?.toUpperCase() || 'GET',
      headers: blindedHeaders,
      body: originalConfig.data,
      originalHeaders,
      strippedHeaders,
      sourceBlindingApplied: true,
    };
  }

  /**
   * Make a source-blinded HTTP request
   */
  async makeBlindedRequest<T = unknown>(
    config: AxiosRequestConfig,
    blindingOptions: {
      provider: string;
      noTrain?: boolean;
      noRetain?: boolean;
      policyProfile?: string;
      dataClass?: string;
      sovereignMode?: string;
    },
  ): Promise<AxiosResponse<T>> {
    const blindedRequest = this.blindRequest(config, blindingOptions);

    // Create new config with blinded headers
    const blindedConfig: AxiosRequestConfig = {
      ...config,
      headers: blindedRequest.headers,
    };

    // Apply proxy configuration if enabled
    if (this.config.proxyConfig?.enabled) {
      blindedConfig.proxy = {
        protocol: this.config.proxyConfig.protocol,
        host: this.config.proxyConfig.host,
        port: this.config.proxyConfig.port,
        auth: this.config.proxyConfig.auth,
      };
    }

    // Log the source blinding action
    this.logger.debug(
      `Source blinding applied for ${blindingOptions.provider}:`,
      {
        strippedHeaders: blindedRequest.strippedHeaders,
        finalHeaderCount: Object.keys(blindedRequest.headers).length,
        originalHeaderCount: Object.keys(blindedRequest.originalHeaders).length,
      },
    );

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>(blindedConfig),
      );

      this.logger.debug(
        `Source-blinded request completed successfully for ${blindingOptions.provider}`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `Source-blinded request failed for ${blindingOptions.provider}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create a source-blinded LangChain HTTP client
   */
  createBlindedHttpClient(
    provider: string,
    options: {
      noTrain?: boolean;
      noRetain?: boolean;
      policyProfile?: string;
      dataClass?: string;
      sovereignMode?: string;
    } = {},
  ) {
    return {
      post: async <T = unknown>(
        url: string,
        data?: unknown,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> => {
        return this.makeBlindedRequest<T>(
          { ...config, method: 'POST', url, data },
          { provider, ...options },
        );
      },
      get: async <T = unknown>(
        url: string,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> => {
        return this.makeBlindedRequest<T>(
          { ...config, method: 'GET', url },
          { provider, ...options },
        );
      },
      put: async <T = unknown>(
        url: string,
        data?: unknown,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> => {
        return this.makeBlindedRequest<T>(
          { ...config, method: 'PUT', url, data },
          { provider, ...options },
        );
      },
      delete: async <T = unknown>(
        url: string,
        config?: AxiosRequestConfig,
      ): Promise<AxiosResponse<T>> => {
        return this.makeBlindedRequest<T>(
          { ...config, method: 'DELETE', url },
          { provider, ...options },
        );
      },
    };
  }

  /**
   * Validate that source blinding is working correctly
   */
  validateSourceBlinding(request: BlindedRequest): {
    valid: boolean;
    issues: string[];
    score: number;
  } {
    const issues: string[] = [];
    let score = 100;

    // Check for leaked identifying headers
    Object.keys(request.headers).forEach((header) => {
      const normalized = header.toLowerCase();
      if (this.config.blockedHeaders.includes(normalized)) {
        issues.push(`Blocked header present: ${header}`);
        score -= 20;
      }
    });

    // Check for proper User-Agent
    if (request.headers['User-Agent'] !== this.config.customUserAgent) {
      issues.push(`Incorrect User-Agent: ${request.headers['User-Agent']}`);
      score -= 10;
    }

    // Check for referrer leakage
    if (request.headers['referer'] || request.headers['referrer']) {
      issues.push('Referrer header present');
      score -= 15;
    }

    // Check for privacy headers
    if (!request.headers['X-Policy-Profile']) {
      issues.push('Missing X-Policy-Profile header');
      score -= 5;
    }

    return {
      valid: issues.length === 0,
      issues,
      score: Math.max(0, score),
    };
  }

  /**
   * Get source blinding statistics
   */
  getStats(): {
    allowedHeaders: number;
    blockedHeaders: number;
    customUserAgent: string;
    proxyEnabled: boolean;
    config: SourceBlindingConfig;
  } {
    return {
      allowedHeaders: this.config.allowedHeaders.length,
      blockedHeaders: this.config.blockedHeaders.length,
      customUserAgent: this.config.customUserAgent,
      proxyEnabled: this.config.proxyConfig?.enabled || false,
      config: { ...this.config },
    };
  }

  /**
   * Update source blinding configuration
   */
  updateConfig(updates: Partial<SourceBlindingConfig>): void {
    Object.assign(this.config, updates);
    this.logger.log('Source blinding configuration updated');
  }

  /**
   * Test source blinding with a sample request
   */
  testSourceBlinding(
    sampleHeaders: Record<string, string>,
    provider: string,
  ): {
    blindedRequest: BlindedRequest;
    validation: {
      isValid: boolean;
      issues: string[];
      blindingEffective: boolean;
      headersStripped: number;
      customUserAgent: boolean;
      policyHeaders: boolean;
    };
  } {
    const mockConfig: AxiosRequestConfig = {
      url: 'https://api.example.com/test',
      method: 'POST',
      headers: sampleHeaders,
    };

    const blindedRequest = this.blindRequest(mockConfig, { provider });
    const rawValidation = this.validateSourceBlinding(blindedRequest);

    // Map the validation result to the expected format
    const validation = {
      isValid: rawValidation.valid,
      issues: rawValidation.issues,
      blindingEffective: rawValidation.score >= 80, // 80+ score = effective
      headersStripped:
        Object.keys(sampleHeaders).length -
        Object.keys(blindedRequest.headers).length,
      customUserAgent:
        blindedRequest.headers['User-Agent'] === this.config.customUserAgent,
      policyHeaders: !!(
        blindedRequest.headers['X-No-Train'] ||
        blindedRequest.headers['X-Policy-Profile']
      ),
    };

    return {
      blindedRequest,
      validation,
    };
  }
}

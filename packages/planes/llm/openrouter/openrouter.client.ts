import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom, type Observable } from 'rxjs';

export type OpenRouterMessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

export interface OpenRouterModelEntry {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { max_completion_tokens?: number };
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  supported_parameters?: string[];
}

export interface OpenRouterVideoModelEntry {
  id: string;
  name: string;
  supported_resolutions?: string[];
  supported_aspect_ratios?: string[];
  pricing_skus?: Record<string, string>;
  allowed_passthrough_parameters?: string[];
}

export interface OpenRouterRequestParams {
  model: string;
  messages: Array<{ role: string; content: OpenRouterMessageContent }>;
  sessionId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface OpenRouterResult {
  content: string;
  model: string;
  usage: OpenRouterUsage;
  cost?: number;
  requestId: string;
}

export interface OpenRouterImageResult {
  images: Array<{ base64: string; mediaType: string }>;
  usage: OpenRouterUsage;
  cost?: number;
  imageBase64?: string;
  content: string;
  model: string;
  requestId: string;
}

export interface OpenRouterVideoJob {
  id: string;
  generationId?: string;
  pollingUrl: string;
  status:
    | 'pending'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'expired';
  unsignedUrls: string[];
  cost?: number;
  error?: string;
}

interface OpenRouterRawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
}

interface OpenRouterProviderPreferences {
  allow_fallbacks: false;
  require_parameters: false;
  data_collection: 'deny';
  zdr?: true;
}

@Injectable()
export class OpenRouterClient {
  private readonly logger = new Logger(OpenRouterClient.name);
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private static readonly MAX_RATE_LIMIT_RETRIES = 4;
  private static inFlight = 0;
  private static readonly waiters: Array<() => void> = [];

  constructor(private readonly httpService: HttpService) {}

  assertConfigured(): void {
    this.getApiKey();
    this.getSiteUrl();
    this.getSiteName();
    this.isVideoEnabled();
  }

  isVideoEnabled(): boolean {
    const value = this.readRequiredEnv('OPENROUTER_VIDEO_ENABLED');
    if (value !== 'true' && value !== 'false') {
      throw new Error(
        `OPENROUTER_VIDEO_ENABLED must be 'true' or 'false', received '${value}'`,
      );
    }
    return value === 'true';
  }

  async chatCompletion(
    params: OpenRouterRequestParams,
  ): Promise<OpenRouterResult> {
    const requestBody: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      session_id: params.sessionId,
      provider: this.providerPreferences(true),
      usage: { include: true },
    };
    if (params.temperature !== undefined) {
      requestBody.temperature = params.temperature;
    }
    if (params.maxTokens !== undefined) {
      requestBody.max_tokens = params.maxTokens;
    }
    if (params.topP !== undefined) {
      requestBody.top_p = params.topP;
    }
    if (params.model === 'openrouter/auto') {
      requestBody.plugins = [this.autoRouterPlugin()];
    }

    this.logger.debug(
      `OpenRouter text request: model=${params.model}, messages=${params.messages.length}`,
    );

    const response = await this.postWithRetry<{
      id?: string;
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: OpenRouterRawUsage;
    }>(`${this.baseUrl}/chat/completions`, requestBody, {
      headers: this.headers(),
      timeout: 120_000,
    });

    const choice = response.data.choices?.[0];
    if (!choice || typeof choice.message?.content !== 'string') {
      throw new Error(
        `OpenRouter returned no text completion for model '${params.model}'`,
      );
    }
    if (!response.data.id) {
      throw new Error('OpenRouter text response is missing id');
    }
    if (!response.data.model) {
      throw new Error('OpenRouter text response is missing resolved model');
    }

    return {
      content: choice.message.content,
      model: response.data.model,
      usage: this.parseUsage(response.data.usage, 'text response'),
      cost: response.data.usage?.cost,
      requestId: response.data.id,
    };
  }

  async listModels(): Promise<OpenRouterModelEntry[]> {
    const response = await firstValueFrom(
      this.httpService.get<{ data?: OpenRouterModelEntry[] }>(
        `${this.baseUrl}/models?output_modalities=all`,
        {
          headers: this.headers(),
          timeout: 30_000,
        },
      ),
    );
    if (!Array.isArray(response.data.data)) {
      throw new Error('OpenRouter model catalog response is missing data');
    }
    return response.data.data;
  }

  async listVideoModels(): Promise<OpenRouterVideoModelEntry[]> {
    const response = await firstValueFrom(
      this.httpService.get<{ data?: OpenRouterVideoModelEntry[] }>(
        `${this.baseUrl}/videos/models`,
        {
          headers: this.headers(),
          timeout: 30_000,
        },
      ),
    );
    if (!Array.isArray(response.data.data)) {
      throw new Error('OpenRouter video model catalog response is missing data');
    }
    return response.data.data;
  }

  async imageGeneration(params: {
    model: string;
    prompt: string;
    size?: string;
    quality?: 'standard' | 'hd';
    numberOfImages?: number;
    referenceImageUrl?: string;
    background?: 'transparent' | 'opaque' | 'auto';
  }): Promise<OpenRouterImageResult> {
    const requestBody: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      provider: this.providerPreferences(true),
      output_format: 'png',
    };
    if (params.size !== undefined) {
      requestBody.size = params.size;
    }
    if (params.quality !== undefined) {
      requestBody.quality = params.quality === 'hd' ? 'high' : 'medium';
    }
    if (params.numberOfImages !== undefined) {
      requestBody.n = params.numberOfImages;
    }
    if (params.background !== undefined) {
      requestBody.background = params.background;
    }
    if (params.referenceImageUrl !== undefined) {
      requestBody.input_references = [
        {
          type: 'image_url',
          image_url: { url: params.referenceImageUrl },
        },
      ];
    }

    const response = await this.postWithRetry<{
      data?: Array<{ b64_json?: string; media_type?: string }>;
      usage?: OpenRouterRawUsage;
    }>(`${this.baseUrl}/images`, requestBody, {
      headers: this.headers(),
      timeout: 180_000,
    });

    if (!Array.isArray(response.data.data) || response.data.data.length === 0) {
      throw new Error(
        `OpenRouter returned no images for model '${params.model}'`,
      );
    }
    const images = response.data.data.map((image, index) => {
      if (!image.b64_json) {
        throw new Error(
          `OpenRouter image response item ${index} is missing base64 data`,
        );
      }
      return {
        base64: image.b64_json,
        mediaType: image.media_type ?? 'image/png',
      };
    });

    const usage = this.parseUsage(response.data.usage, 'image response');
    return {
      images,
      usage,
      cost: usage.cost,
      imageBase64: images[0]?.base64,
      content: '',
      model: params.model,
      requestId: `openrouter-image-${Date.now()}`,
    };
  }

  async submitVideo(params: {
    model: string;
    prompt: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    firstFrameImageUrl?: string;
    lastFrameImageUrl?: string;
    generateAudio?: boolean;
  }): Promise<OpenRouterVideoJob> {
    this.assertVideoEnabled();
    const requestBody: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      provider: this.providerPreferences(false),
    };
    if (params.duration !== undefined) {
      requestBody.duration = params.duration;
    }
    if (params.aspectRatio !== undefined) {
      requestBody.aspect_ratio = params.aspectRatio;
    }
    if (params.resolution !== undefined) {
      requestBody.resolution = params.resolution;
    }
    if (params.generateAudio !== undefined) {
      requestBody.generate_audio = params.generateAudio;
    }
    const frameImages: Array<Record<string, unknown>> = [];
    if (params.firstFrameImageUrl) {
      frameImages.push({
        type: 'image_url',
        image_url: { url: params.firstFrameImageUrl },
        frame_type: 'first_frame',
      });
    }
    if (params.lastFrameImageUrl) {
      frameImages.push({
        type: 'image_url',
        image_url: { url: params.lastFrameImageUrl },
        frame_type: 'last_frame',
      });
    }
    if (frameImages.length > 0) {
      requestBody.frame_images = frameImages;
    }

    const response = await firstValueFrom(
      this.httpService.post<{
        id?: string;
        generation_id?: string;
        polling_url?: string;
        status?: OpenRouterVideoJob['status'];
        unsigned_urls?: string[];
        usage?: { cost?: number };
        error?: string;
      }>(`${this.baseUrl}/videos`, requestBody, {
        headers: this.headers(),
        timeout: 30_000,
      }),
    );
    return this.parseVideoJob(response.data, 'submit response');
  }

  async pollVideo(operationId: string): Promise<OpenRouterVideoJob> {
    this.assertVideoEnabled();
    const response = await firstValueFrom(
      this.httpService.get<{
        id?: string;
        generation_id?: string;
        polling_url?: string;
        status?: OpenRouterVideoJob['status'];
        unsigned_urls?: string[];
        usage?: { cost?: number };
        error?: string;
      }>(`${this.baseUrl}/videos/${encodeURIComponent(operationId)}`, {
        headers: this.headers(),
        timeout: 30_000,
      }),
    );
    return this.parseVideoJob(response.data, 'poll response');
  }

  async downloadVideo(operationId: string): Promise<Buffer> {
    this.assertVideoEnabled();
    const response = await firstValueFrom(
      this.httpService.get<ArrayBuffer>(
        `${this.baseUrl}/videos/${encodeURIComponent(operationId)}/content`,
        {
          headers: this.headers(),
          responseType: 'arraybuffer',
          timeout: 120_000,
        },
      ),
    );
    if (!response.data || response.data.byteLength === 0) {
      throw new Error(
        `OpenRouter video '${operationId}' returned empty content`,
      );
    }
    return Buffer.from(response.data);
  }

  private parseVideoJob(
    data: {
      id?: string;
      generation_id?: string;
      polling_url?: string;
      status?: OpenRouterVideoJob['status'];
      unsigned_urls?: string[];
      usage?: { cost?: number };
      error?: string;
    },
    label: string,
  ): OpenRouterVideoJob {
    if (!data.id || !data.polling_url || !data.status) {
      throw new Error(`OpenRouter video ${label} is incomplete`);
    }
    return {
      id: data.id,
      generationId: data.generation_id,
      pollingUrl: data.polling_url,
      status: data.status,
      unsignedUrls: data.unsigned_urls ?? [],
      cost: data.usage?.cost,
      error: data.error,
    };
  }

  private parseUsage(
    usage: OpenRouterRawUsage | undefined,
    label: string,
  ): OpenRouterUsage {
    if (
      usage?.prompt_tokens === undefined ||
      usage.completion_tokens === undefined ||
      usage.total_tokens === undefined
    ) {
      throw new Error(`OpenRouter ${label} is missing token usage`);
    }
    if (typeof usage.cost !== 'number' || !Number.isFinite(usage.cost)) {
      throw new Error(`OpenRouter ${label} is missing cost usage`);
    }
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      cost: usage.cost,
    };
  }

  private autoRouterPlugin(): Record<string, unknown> {
    const rawModels = this.readRequiredEnv('OPENROUTER_AUTO_ALLOWED_MODELS');
    let allowedModels: unknown;
    try {
      allowedModels = JSON.parse(rawModels);
    } catch (error) {
      throw new Error(
        `OPENROUTER_AUTO_ALLOWED_MODELS must be valid JSON (got ${JSON.stringify(rawModels)}): ${
          error instanceof Error ? error.message : String(error)
        }. If the API was started via shell \`source .env\`, quote the value as ` +
          `'["anthropic/*","openai/*"]' so the shell does not strip the inner quotes.`,
      );
    }
    if (
      !Array.isArray(allowedModels) ||
      allowedModels.length === 0 ||
      allowedModels.some(
        (model) => typeof model !== 'string' || model.trim() === '',
      )
    ) {
      throw new Error(
        'OPENROUTER_AUTO_ALLOWED_MODELS must be a non-empty JSON array of model patterns',
      );
    }

    const tradeoffRaw = this.readRequiredEnv(
      'OPENROUTER_AUTO_COST_QUALITY_TRADEOFF',
    );
    const tradeoff = Number(tradeoffRaw);
    if (!Number.isInteger(tradeoff) || tradeoff < 0 || tradeoff > 10) {
      throw new Error(
        `OPENROUTER_AUTO_COST_QUALITY_TRADEOFF must be an integer from 0 to 10, received '${tradeoffRaw}'`,
      );
    }
    return {
      id: 'auto-router',
      allowed_models: allowedModels,
      cost_quality_tradeoff: tradeoff,
    };
  }

  private providerPreferences(includeZdr: boolean): OpenRouterProviderPreferences {
    return {
      allow_fallbacks: false,
      // Not required: strict parameter-matching excludes models whose only ZDR
      // endpoint (e.g. Claude via Bedrock) does not advertise temperature/top_p,
      // which returns 404 under zdr=true. Privacy (zdr + data_collection:'deny')
      // is unchanged; only parameter-honoring strictness is relaxed.
      require_parameters: false,
      data_collection: 'deny',
      ...(includeZdr ? { zdr: true as const } : {}),
    };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getApiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': this.getSiteUrl(),
      'X-Title': this.getSiteName(),
    };
  }

  private async postWithRetry<T>(
    url: string,
    body: Record<string, unknown>,
    config: { headers: Record<string, string>; timeout: number },
  ): Promise<AxiosResponse<T>> {
    await this.acquireSlot();
    try {
      let attempt = 0;
      while (true) {
        attempt += 1;
        try {
          return await firstValueFrom(
            this.httpService.post<T>(url, body, config) as Observable<
              AxiosResponse<T>
            >,
          );
        } catch (error) {
          const status = this.getHttpStatus(error);
          if (
            status !== 429 ||
            attempt > OpenRouterClient.MAX_RATE_LIMIT_RETRIES
          ) {
            throw error;
          }
          const delayMs = this.getRetryDelayMs(error, attempt);
          this.logger.warn(
            `OpenRouter rate limited (429) on ${url}; retry ${attempt}/${OpenRouterClient.MAX_RATE_LIMIT_RETRIES} in ${delayMs}ms`,
          );
          // Release the slot while waiting so other queued calls are not
          // blocked behind a rate-limit cool-down.
          this.releaseSlot();
          try {
            await this.sleep(delayMs);
          } finally {
            await this.acquireSlot();
          }
        }
      }
    } finally {
      this.releaseSlot();
    }
  }

  private getMaxConcurrent(): number {
    const raw = process.env.OPENROUTER_MAX_CONCURRENT;
    if (!raw || raw.trim() === '') {
      return 1;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(
        `OPENROUTER_MAX_CONCURRENT must be a positive integer, received '${raw}'`,
      );
    }
    return parsed;
  }

  private async acquireSlot(): Promise<void> {
    if (OpenRouterClient.inFlight < this.getMaxConcurrent()) {
      OpenRouterClient.inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      OpenRouterClient.waiters.push(() => {
        OpenRouterClient.inFlight += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    OpenRouterClient.inFlight = Math.max(0, OpenRouterClient.inFlight - 1);
    const next = OpenRouterClient.waiters.shift();
    if (next) {
      next();
    }
  }

  private getHttpStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }
    const axiosError = error as AxiosError;
    if (typeof axiosError.response?.status === 'number') {
      return axiosError.response.status;
    }
    const message =
      error instanceof Error ? error.message : String(error);
    const match = message.match(/status(?: code)? (\d{3})/i);
    if (!match) {
      return undefined;
    }
    return Number(match[1]);
  }

  private getRetryDelayMs(error: unknown, attempt: number): number {
    const retryAfterHeader =
      error && typeof error === 'object'
        ? (error as AxiosError).response?.headers?.['retry-after']
        : undefined;
    if (typeof retryAfterHeader === 'string' && retryAfterHeader.trim() !== '') {
      const asSeconds = Number(retryAfterHeader);
      if (Number.isFinite(asSeconds) && asSeconds >= 0) {
        return Math.min(Math.ceil(asSeconds * 1000), 30_000);
      }
    }

    const baseMs = this.getRetryBaseMs();
    // attempt 1 -> base, 2 -> 2x, 3 -> 4x, 4 -> 8x, plus jitter to desync herds
    const exponential = Math.min(baseMs * 2 ** (attempt - 1), 30_000);
    const jitter = Math.floor(Math.random() * Math.min(250, exponential));
    return Math.min(exponential + jitter, 30_000);
  }

  private getRetryBaseMs(): number {
    const raw = process.env.OPENROUTER_RETRY_BASE_MS;
    if (!raw || raw.trim() === '') {
      return 1000;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(
        `OPENROUTER_RETRY_BASE_MS must be a positive integer, received '${raw}'`,
      );
    }
    return parsed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private assertVideoEnabled(): void {
    if (!this.isVideoEnabled()) {
      throw new Error(
        'OpenRouter video generation is disabled by OPENROUTER_VIDEO_ENABLED=false',
      );
    }
    const acknowledged = this.readRequiredEnv(
      'OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED',
    );
    if (acknowledged !== 'true') {
      throw new Error(
        'OPENROUTER_VIDEO_RETENTION_ACKNOWLEDGED=true is required because video generation is not eligible for zero data retention',
      );
    }
  }

  private getApiKey(): string {
    return this.readRequiredEnv('OPENROUTER_API_KEY');
  }

  private getSiteUrl(): string {
    const value = this.readRequiredEnv('OPENROUTER_SITE_URL');
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('OPENROUTER_SITE_URL must be a valid HTTPS URL');
    }
    if (url.protocol !== 'https:') {
      throw new Error('OPENROUTER_SITE_URL must be a valid HTTPS URL');
    }
    return value;
  }

  private getSiteName(): string {
    return this.readRequiredEnv('OPENROUTER_SITE_NAME');
  }

  private readRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      throw new Error(`${key} is required for LLM_PROVIDER=openrouter`);
    }
    return value;
  }
}

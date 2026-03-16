import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Vision extraction result
 */
export interface VisionExtractionResult {
  /** Extracted text content */
  text: string;
  /** Vision model used */
  model: string;
  /** Provider used */
  provider: string;
  /** Confidence score (0-1) */
  confidence?: number;
}

/**
 * Vision Extraction Service
 *
 * Handles text extraction from images and scanned documents using vision models.
 * Uses LLM service with vision-capable models (GPT-4 Vision, Claude 3 Vision, etc.)
 *
 * Vision Model Configuration:
 * - Reads from ENV: VISION_MODEL (default: gpt-4-vision-preview)
 * - Reads from ENV: VISION_PROVIDER (default: openai)
 * - For Ollama: reads OLLAMA_BASE_URL
 *
 * ExecutionContext Flow:
 * - Passes full ExecutionContext to LLM service
 * - LLM service automatically tracks usage and costs
 * - Observability events emitted automatically
 *
 * Supported Formats:
 * - PNG, JPG, JPEG, WEBP, GIF
 * - PDF (first page only for vision extraction)
 *
 * @example
 * ```typescript
 * const result = await visionExtraction.extractText(
 *   imageBuffer,
 *   'image/png',
 *   executionContext
 * );
 * // result: { text: '...', model: 'gpt-4-vision-preview', provider: 'openai' }
 * ```
 */
@Injectable()
export class VisionExtractionService {
  private readonly logger = new Logger(VisionExtractionService.name);
  private readonly visionModel: string;
  private readonly visionProvider: string;
  private readonly ollamaBaseUrl: string;

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly configService: ConfigService,
  ) {
    // Read vision model configuration from ENV
    this.visionModel =
      this.configService.get<string>('VISION_MODEL') || 'gpt-4-vision-preview';
    this.visionProvider =
      this.configService.get<string>('VISION_PROVIDER') || 'openai';
    this.ollamaBaseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://localhost:11434';

    this.logger.log(
      `👁️ [VISION-EXTRACTION] Initialized with provider=${this.visionProvider}, model=${this.visionModel}`,
    );
  }

  /**
   * Extract text from image or scanned document using vision model
   *
   * @param buffer - Image/document buffer
   * @param mimeType - MIME type of the file
   * @param context - ExecutionContext for LLM service
   * @returns VisionExtractionResult with extracted text
   */
  async extractText(
    buffer: Buffer,
    mimeType: string,
    context: ExecutionContext,
  ): Promise<VisionExtractionResult> {
    this.logger.log(
      `👁️ [VISION-EXTRACTION] Extracting text from ${mimeType} (${buffer.length} bytes)`,
    );

    // Validate supported formats
    if (!this.isSupportedFormat(mimeType)) {
      throw new Error(`Unsupported format for vision extraction: ${mimeType}`);
    }

    // Convert buffer to base64
    const base64Image = buffer.toString('base64');

    // Build vision prompt
    const systemPrompt = `You are an expert document text extractor. Your task is to extract ALL text content from the provided image or document.

Instructions:
- Extract all visible text exactly as it appears
- Maintain original formatting, line breaks, and structure
- If the image contains tables, preserve table structure
- If the image contains multiple columns, extract left-to-right, top-to-bottom
- Do NOT add any commentary or explanation
- Do NOT omit any text
- Output ONLY the extracted text

If the image is unclear or text is unreadable, indicate which parts are unclear.`;

    const userPrompt = `Extract all text from this image/document.`;

    try {
      // Call LLM service with vision capability
      // Note: LLM service will automatically:
      // - Track usage and costs via RunMetadataService
      // - Emit observability events
      // - Handle provider routing
      const response = await this.llmService.generateResponse(
        systemPrompt,
        userPrompt,
        {
          executionContext: context,
          callerType: 'api',
          callerName: 'vision-extraction',
          provider: this.visionProvider as
            | 'openai'
            | 'anthropic'
            | 'ollama'
            | 'google',
          model: this.visionModel,
          // Vision-specific options
          images: [{ base64: base64Image, mimeType }],
        },
      );

      const text =
        typeof response === 'string' ? response : response.content || '';

      this.logger.log(
        `👁️ [VISION-EXTRACTION] Extraction successful (${text.length} chars)`,
      );

      return {
        text,
        model: this.visionModel,
        provider: this.visionProvider,
        confidence: 0.9, // Vision models typically have high confidence
      };
    } catch (error) {
      this.logger.error(
        `👁️ [VISION-EXTRACTION] Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Vision extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if format is supported for vision extraction
   */
  private isSupportedFormat(mimeType: string): boolean {
    const supportedFormats = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf', // First page only
    ];

    return supportedFormats.includes(mimeType);
  }

  /**
   * Get current vision configuration
   */
  getConfiguration(): {
    model: string;
    provider: string;
    ollamaBaseUrl?: string;
  } {
    return {
      model: this.visionModel,
      provider: this.visionProvider,
      ...(this.visionProvider === 'ollama' && {
        ollamaBaseUrl: this.ollamaBaseUrl,
      }),
    };
  }
}

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  IVisionExtractor,
  ExtractionResult,
  VisionExecutionContext,
} from './document-extractor.interface';

/**
 * Port the host application must provide so the vision extractor can call an
 * LLM without the extractors plane importing the LLM plane (circular).
 *
 * The host wraps `LLM_SERVICE.generateResponse()` (or equivalent) in a function
 * matching this shape and provides it via `VISION_LLM_CALLER`.
 */
export interface VisionLlmCaller {
  callVisionModel(args: {
    systemPrompt: string;
    userPrompt: string;
    base64Image: string;
    mimeType: string;
    provider: string;
    model: string;
    context: VisionExecutionContext;
  }): Promise<{ text: string }>;
}

export const VISION_LLM_CALLER = Symbol('VISION_LLM_CALLER');

const DEFAULT_VISION_PROMPT = `You are an expert document text extractor. Your task is to extract ALL text content from the provided image or document.

Instructions:
- Extract all visible text exactly as it appears
- Maintain original formatting, line breaks, and structure
- If the image contains tables, preserve table structure
- If the image contains multiple columns, extract left-to-right, top-to-bottom
- Do NOT add any commentary or explanation
- Do NOT omit any text
- Output ONLY the extracted text

If the image is unclear or text is unreadable, indicate which parts are unclear.`;

/**
 * VisionExtractorService — extracts text from images and scanned PDFs by
 * sending the image to a vision-capable LLM.
 *
 * Defaults: provider/model from `VISION_PROVIDER` / `VISION_MODEL` env vars,
 * falling back to `openai` / `gpt-4-vision-preview`. The host application
 * registers a VisionLlmCaller in its DI container; if absent, the extractor
 * reports `isAvailable() === false` and `extract()` throws.
 *
 * Lifted and refactored from orchestrator-ai-dev's
 * apps/api/src/agent2agent/services/vision-extraction.service.ts (which
 * imported the LLM plane directly). Here we invert the dependency so the
 * extractors package stays standalone.
 */
@Injectable()
export class VisionExtractorService implements IVisionExtractor {
  private readonly logger = new Logger(VisionExtractorService.name);
  private readonly defaultModel: string;
  private readonly defaultProvider: string;

  constructor(
    @Optional()
    @Inject(VISION_LLM_CALLER)
    private readonly llmCaller?: VisionLlmCaller,
  ) {
    this.defaultModel = process.env.VISION_MODEL || 'gpt-4-vision-preview';
    this.defaultProvider = process.env.VISION_PROVIDER || 'openai';
    if (this.llmCaller) {
      this.logger.log(
        `VisionExtractorService initialized (provider=${this.defaultProvider}, model=${this.defaultModel})`,
      );
    } else {
      this.logger.warn(
        'VisionExtractorService loaded WITHOUT VISION_LLM_CALLER — vision extraction disabled until the host provides one.',
      );
    }
  }

  isAvailable(): boolean {
    return Boolean(this.llmCaller);
  }

  async extract(
    buffer: Buffer,
    mimeType: string,
    context: VisionExecutionContext,
  ): Promise<ExtractionResult> {
    if (!this.llmCaller) {
      throw new Error(
        'Vision extraction requires a VISION_LLM_CALLER provider in the host application.',
      );
    }
    if (!this.isSupportedFormat(mimeType)) {
      throw new Error(`Unsupported format for vision extraction: ${mimeType}`);
    }

    this.logger.log(
      `🔍 [VISION] Extracting text from ${mimeType} (${buffer.length} bytes, conv=${context.conversationId})`,
    );

    const base64Image = buffer.toString('base64');
    const provider = context.provider || this.defaultProvider;
    const model = context.model || this.defaultModel;

    try {
      const result = await this.llmCaller.callVisionModel({
        systemPrompt: DEFAULT_VISION_PROMPT,
        userPrompt: 'Extract all text from this image/document.',
        base64Image,
        mimeType,
        provider,
        model,
        context,
      });

      this.logger.log(
        `🔍 [VISION] Extraction successful (${result.text.length} chars)`,
      );

      return {
        text: result.text,
        metadata: {
          extractor: 'vision',
          provider,
          model,
          confidence: 0.9,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`🔍 [VISION] Extraction failed: ${message}`);
      throw new Error(`Vision extraction failed: ${message}`);
    }
  }

  private isSupportedFormat(mimeType: string): boolean {
    return [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf',
    ].includes(mimeType);
  }
}

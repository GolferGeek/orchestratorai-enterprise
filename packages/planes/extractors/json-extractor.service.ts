import { Injectable, Logger } from '@nestjs/common';
import {
  IDocumentExtractor,
  ExtractionResult,
} from './document-extractor.interface';

/**
 * JsonExtractorService — turns a JSON buffer into LLM-friendly text.
 *
 * Strategy: parse → pretty-print with 2-space indent. If parsing fails (the
 * file is malformed), fall back to the raw text so the LLM at least sees
 * something. No external dependencies.
 */
@Injectable()
export class JsonExtractorService implements IDocumentExtractor {
  private readonly logger = new Logger(JsonExtractorService.name);

  isAvailable(): boolean {
    return true;
  }

  extract(buffer: Buffer): Promise<ExtractionResult> {
    const raw = buffer.toString('utf-8').replace(/^\uFEFF/, '').trim();
    let text = raw;
    let parseError: string | undefined;
    let topLevelType: string | undefined;
    let keyCount: number | undefined;

    try {
      const parsed = JSON.parse(raw) as unknown;
      text = JSON.stringify(parsed, null, 2);
      if (Array.isArray(parsed)) {
        topLevelType = 'array';
        keyCount = parsed.length;
      } else if (parsed && typeof parsed === 'object') {
        topLevelType = 'object';
        keyCount = Object.keys(parsed as Record<string, unknown>).length;
      } else {
        topLevelType = typeof parsed;
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
      this.logger.warn(`JSON parse failed, returning raw text: ${parseError}`);
    }

    return Promise.resolve({
      text,
      metadata: {
        extractor: 'json',
        ...(topLevelType !== undefined && { topLevelType }),
        ...(keyCount !== undefined && { keyCount }),
        ...(parseError !== undefined && { parseError }),
      },
    });
  }

  async extractText(buffer: Buffer): Promise<string> {
    const result = await this.extract(buffer);
    return result.text;
  }
}

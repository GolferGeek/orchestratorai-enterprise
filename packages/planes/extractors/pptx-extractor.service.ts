import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  IDocumentExtractor,
  ExtractionResult,
} from './document-extractor.interface';

/** The slice of the optional `jszip` API this extractor uses. */
interface JsZipEntry {
  async(type: 'string'): Promise<string>;
}

interface JsZipArchive {
  files: Record<string, JsZipEntry>;
}

interface JsZipStatic {
  loadAsync(data: Buffer): Promise<JsZipArchive>;
}

/**
 * PptxExtractorService — extracts text from PowerPoint .pptx slides.
 *
 * Strategy: a .pptx is a zip of XML; the slide bodies live at
 * `ppt/slides/slide{N}.xml`. We use the optional `jszip` dependency to crack
 * the zip and a tiny tag-stripping pass to pull text out of `<a:t>` runs.
 *
 * No native deps. If `jszip` isn't installed, `isAvailable()` returns false
 * and `extract()` throws — the host can decide whether to surface the error
 * or skip the file.
 */
@Injectable()
export class PptxExtractorService implements IDocumentExtractor, OnModuleInit {
  private readonly logger = new Logger(PptxExtractorService.name);
  private JSZip: JsZipStatic | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initJsZip();
  }

  async onModuleInit(): Promise<void> {
    await this.initPromise;
    this.logger.log(
      `PptxExtractorService initialized, available: ${this.isAvailable()}`,
    );
  }

  private async initJsZip(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const jszip = require('jszip') as JsZipStatic & {
        default?: JsZipStatic;
      };
      this.JSZip = jszip.default || jszip;
      this.logger.log('jszip loaded successfully');
    } catch (error) {
      this.logger.warn(
        `jszip initialization failed: ${error instanceof Error ? error.message : String(error)}. PPTX extraction disabled.`,
      );
    }
  }

  isAvailable(): boolean {
    return this.JSZip !== null;
  }

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    if (!this.JSZip) {
      throw new Error(
        'PPTX extraction requires the jszip dependency (npm install jszip).',
      );
    }
    const zip = await this.JSZip.loadAsync(buffer);
    const slideFiles = Object.entries(zip.files)
      .filter(
        ([name]) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'),
      )
      .sort(([a], [b]) => this.slideNumber(a) - this.slideNumber(b));

    const slides: string[] = [];
    for (const [, entry] of slideFiles) {
      const xml = await entry.async('string');
      const text = this.stripXml(xml);
      if (text.length > 0) slides.push(text);
    }

    const allText = slides
      .map((s, i) => `### Slide ${i + 1}\n${s}`)
      .join('\n\n');

    this.logger.debug(
      `PPTX extracted ${slides.length} slides, ${allText.length} chars`,
    );

    return {
      text: allText,
      metadata: {
        extractor: 'pptx',
        pageCount: slides.length,
      },
    };
  }

  async extractText(buffer: Buffer): Promise<string> {
    const result = await this.extract(buffer);
    return result.text;
  }

  /**
   * Pull text out of slide XML by extracting the contents of every `<a:t>`
   * tag (the run-of-text element in OOXML drawingML). Cheap and reliable for
   * text extraction; intentionally drops formatting.
   */
  private stripXml(xml: string): string {
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
    const texts = matches.map((m) =>
      m
        .replace(/<a:t[^>]*>/, '')
        .replace(/<\/a:t>/, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    );
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }

  private slideNumber(filename: string): number {
    const match = filename.match(/slide(\d+)\.xml$/);
    return match ? parseInt(match[1]!, 10) : 0;
  }
}

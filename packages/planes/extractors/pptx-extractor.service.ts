import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  IDocumentExtractor,
  ExtractionResult,
} from './document-extractor.interface';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private JSZip: any | null = null;
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

  // eslint-disable-next-line @typescript-eslint/require-await
  private async initJsZip(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
      const jszip = require('jszip');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const zip = await this.JSZip.loadAsync(buffer);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const slideFiles: string[] = Object.keys(zip.files)
      .filter(
        (name: string) =>
          name.startsWith('ppt/slides/slide') && name.endsWith('.xml'),
      )
      .sort((a, b) => this.slideNumber(a) - this.slideNumber(b));

    const slides: string[] = [];
    for (const file of slideFiles) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const xml: string = await zip.files[file].async('string');
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

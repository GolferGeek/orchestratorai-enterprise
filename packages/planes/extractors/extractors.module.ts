import { Global, Module } from '@nestjs/common';
import { TextExtractorService } from './text-extractor.service';
import { PdfExtractorService } from './pdf-extractor.service';
import { DocxExtractorService } from './docx-extractor.service';
import { JsonExtractorService } from './json-extractor.service';
import { CsvExtractorService } from './csv-extractor.service';
import { PptxExtractorService } from './pptx-extractor.service';
import { VisionExtractorService } from './vision-extractor.service';
import { DocumentExtractionRouter } from './document-extraction-router.service';

/**
 * ExtractorsModule — global extractors plane.
 *
 * Every product imports this once at the AppModule level (or relies on its
 * @Global() registration). After that, any service in any product can inject
 * `DocumentExtractionRouter` and call `.extract()` for any supported file
 * type.
 *
 * Vision extraction needs an LLM caller wired in by the host application via
 * the `VISION_LLM_CALLER` token (see vision-extractor.service.ts). Without
 * it, image and scanned-PDF extraction reports unavailable and the router
 * surfaces a clear error.
 */
@Global()
@Module({
  providers: [
    TextExtractorService,
    PdfExtractorService,
    DocxExtractorService,
    JsonExtractorService,
    CsvExtractorService,
    PptxExtractorService,
    VisionExtractorService,
    DocumentExtractionRouter,
  ],
  exports: [
    TextExtractorService,
    PdfExtractorService,
    DocxExtractorService,
    JsonExtractorService,
    CsvExtractorService,
    PptxExtractorService,
    VisionExtractorService,
    DocumentExtractionRouter,
  ],
})
export class ExtractorsModule {}

---
name: forge-document-onboarding-workflow
description: File-upload workflow specifics for async LangGraph workflows in Forge
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Forge Document Onboarding Workflow Pattern

This skill covers the file-upload-specific aspects of an async Forge workflow. It extends the base async workflow pattern (see `forge-async-workflow` skill) with multipart upload handling, document extraction, per-file storage, and multi-document fan-out.

## Canonical Reference Files

- **Controller (upload endpoint)**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.controller.ts` (the `upload()` method at `POST /jobs/upload`)
- **Documents storage service**: `apps/forge/api/src/agents/legal-department/jobs/legal-documents-storage.service.ts`
- **Repository (document path methods)**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs.repository.ts` (`updateDocumentPaths`, `updateOriginalFilePath`)
- **Worker (metadata extraction)**: `apps/forge/api/src/agents/legal-department/jobs/legal-jobs-worker.service.ts`
- **Intelligence service (metadata extraction)**: `apps/forge/api/src/agents/legal-department/services/legal-intelligence.service.ts`
- **Frontend upload modal**: `apps/forge/web/src/views/agents/legal-department/components/OnboardDocumentModal.vue`
- **Frontend service (uploadFiles)**: `apps/forge/web/src/views/agents/legal-department/legalJobsService.ts`
- **State (documents + documentsMetadata)**: `apps/forge/api/src/agents/legal-department/legal-department.state.ts`

## 1. Multipart Upload Endpoint

Use NestJS `FilesInterceptor` from `@nestjs/platform-express` to accept multiple files:

```typescript
import { FilesInterceptor } from '@nestjs/platform-express';

const MAX_FILES = 10;

@Post('jobs/upload')
@HttpCode(HttpStatus.ACCEPTED)
@UseInterceptors(FilesInterceptor('files', MAX_FILES))
async upload(
  @UploadedFiles() files: Express.Multer.File[] | undefined,
  @Body('context') contextJson: string | undefined,
  @Body('capabilitySlug') capabilitySlug: string | undefined,
): Promise<EnqueueJobResponse> {
  // Validate files exist and count
  if (!files || files.length === 0) throw new BadRequestException('files required');
  if (files.length > MAX_FILES) throw new BadRequestException(`Too many files: max ${MAX_FILES}`);

  // Parse context from JSON string (multipart fields are strings)
  const context = JSON.parse(contextJson);
  // Validate ExecutionContext fields (orgSlug, userId, provider, model)
  // ...
}
```

Key details:
- The `context` field is a JSON string because multipart forms cannot carry structured objects natively.
- The field name is `files` (plural). Legacy single-file uploads via `file` (singular) still work because FilesInterceptor captures both.
- The accepted file types are configured in the frontend: `.txt .md .json .csv .pdf .docx .pptx .png .jpg .jpeg .webp .gif`.

## 2. DocumentExtractionRouter

Each uploaded file is routed through `DocumentExtractionRouter` from `@orchestratorai/planes/extractors` to produce plain text:

```typescript
import { DocumentExtractionRouter } from '@orchestratorai/planes/extractors';

// Extract all files in parallel
const extracted = await Promise.all(
  files.map(async (file) => {
    const result = await this.extractor.extract({
      buffer: file.buffer,
      mimeType: file.mimetype,
      filename: file.originalname,
      context: visionCtx, // ExecutionContext-shaped for vision fallback
    });
    return { file, result };
  }),
);
```

The extractor handles text/plain, PDF (native + OCR), DOCX, PPTX, and images (via vision model fallback). The `context` parameter is needed so image/scanned-PDF extraction can call a vision LLM with proper attribution.

After extraction, validate the combined token budget:

```typescript
const combinedText = extracted.map(e => e.result.text).join('\n\n');
this.assertWithinInputBudget(combinedText, model);
```

## 3. Per-File Storage with Index-Prefixed Filenames

Each original file is persisted to `MEDIA_STORAGE_PROVIDER` with an index-prefixed filename so the ordering is preserved:

```typescript
const storagePaths: string[] = [];
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const storagePath = await this.documentsStorage.storeOriginal(
    row.id,                           // job ID as the storage folder
    `${i}-${file.originalname}`,      // index-prefixed filename
    file.buffer,
    file.mimetype,
  );
  storagePaths.push(storagePath);
}
```

Storage is best-effort: a failure does not abort the job (the extracted text is already in the job input). After storage, write paths back to the database:

```typescript
await this.repository.updateDocumentPaths(row.id, storagePaths);
await this.repository.updateOriginalFilePath(row.id, storagePaths[0]); // back-compat
```

### document_paths TEXT[] Column

The `document_paths` column is a Postgres `TEXT[]` array. Use `rawQuery` with parameterized binding to set it, because the PostgREST/QueryBuilder `update()` path serializes `string[]` incorrectly for array columns:

```sql
UPDATE {schema}.agent_jobs
SET document_paths = $1::text[],
    document_count = $2
WHERE id = $3
```

## 4. Documents Array Shape

The controller normalizes all inputs into a uniform `documents[]` array in the job input:

```typescript
const documents = extracted.map(({ file, result }) => ({
  content: result.text,          // extracted plain text
  contentType: 'text/plain',
  filename: file.originalname,
  mimeType: file.mimetype,
  extractorMetadata: result.metadata,
}));

// Back-compat: top-level content field mirrors the first document
const enqueueRequest = {
  context,
  data: {
    content: documents[0].content,
    contentType: 'text/plain',
    documents,
    document_count: documents.length,
  },
};
```

Single-document JSON body submissions (`POST /jobs`) are also normalized to a single-element `documents[]` array so the worker always sees a uniform shape.

## 5. Parallel Metadata Extraction in the Worker

The worker extracts metadata for all documents in parallel before starting the graph:

```typescript
await this.repository.updateProgress(job.id, {
  current_step: 'extracting metadata',
  progress: 5,
  last_message: `Extracting legal metadata (${documents.length} documents)`,
});

const documentsMetadata = await this.intelligenceService.extractMetadataForAll(
  context,
  documents,
);
```

`extractMetadataForAll` runs parallel LLM calls (one per document) to classify document types, extract sections, signatures, dates, and parties. The metadata is index-aligned with `documents[]`.

## 6. Multi-Document Fan-Out in the Graph

The LangGraph state carries both arrays:

```typescript
// State annotation
documents: Annotation<Array<{ name: string; content: string; type?: string }>>({
  reducer: (_, next) => next,
  default: () => [],
}),

documentsMetadata: Annotation<LegalDocumentMetadata[]>({
  reducer: (_, next) => next,
  default: () => [],
}),
```

Specialist helper nodes iterate over `state.documents` and `state.documentsMetadata` in parallel:

```typescript
// Inside a specialist node helper
for (let i = 0; i < state.documents.length; i++) {
  const doc = state.documents[i];
  const meta = state.documentsMetadata[i];
  // Analyze each document with its metadata context
}
```

## 7. Cross-Document Synthesis

After all specialists complete, a synthesis node combines findings across all documents:

- Specialist outputs are stored in `state.specialistOutputs` keyed by specialist name.
- The synthesis node reads all specialist outputs and produces an `executiveSummary`, `overallRisk`, `keyFindings`, and `recommendations`.
- The report-generation node then produces a final markdown report incorporating the synthesis.

## 8. Frontend Upload Modal

The `OnboardDocumentModal.vue` component provides:

- **Drag-and-drop zone** with `@dragover.prevent` / `@dragleave.prevent` / `@drop.prevent` handlers.
- **File picker** via hidden `<input type="file" multiple>` with accept filter.
- **File list preview** showing filename and formatted byte size.
- **Submit button** that calls `legalJobsService.uploadFiles(context, files, capabilitySlug)`.
- **Error display** for extraction or upload failures.
- Emits `queued` event with `{ jobId, conversationId }` on success; parent refreshes the activity list.

```typescript
// legalJobsService.uploadFiles
async uploadFiles(
  context: ExecutionContextLike,
  files: File[],
  capabilitySlug = 'document-onboarding',
): Promise<{ jobId: string; conversationId: string; status: JobStatus }> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  form.append('context', JSON.stringify(context));
  form.append('capabilitySlug', capabilitySlug);
  const res = await fetch(`${FORGE_API_URL}/{domain}/jobs/upload`, {
    method: 'POST',
    body: form,
  });
  return await res.json();
}
```

## Scaffolding Checklist

When adding document upload to an async workflow:

1. Add `document_paths TEXT[] DEFAULT '{}'` and `document_count INTEGER DEFAULT 1` columns to the job table.
2. Create a `{domain}-documents-storage.service.ts` wrapping `MEDIA_STORAGE_PROVIDER` with `storeOriginal(jobId, filename, buffer, mimeType)` and `downloadOriginal(path)`.
3. Add `updateDocumentPaths(id, paths)` and `updateOriginalFilePath(id, path)` to the repository (use `rawQuery` for TEXT[] binding).
4. Add the `POST /jobs/upload` endpoint with `@UseInterceptors(FilesInterceptor('files', MAX_FILES))`.
5. Inject `DocumentExtractionRouter` for text extraction from PDF/DOCX/image files.
6. Add `documents` and `documentsMetadata` to the LangGraph state annotation.
7. Add metadata extraction to the worker before graph dispatch.
8. Create the frontend upload modal with drag-and-drop + file picker.
9. Add `uploadFiles()` to the frontend service using `FormData`.

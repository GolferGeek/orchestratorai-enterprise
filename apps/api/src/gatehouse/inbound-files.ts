import { Injectable } from '@nestjs/common';
import type { ExecutionContext, WorkflowDocumentRef } from '@orchestrator-ai/transport-types';
import { readBoundedBytes } from '../common/outbound/bounded-json-response';
import { OutboundUrlValidatorService } from '../common/outbound/outbound-url-validator.service';
import {
  WORKFLOW_DOCUMENT_MAX_BYTES,
  WORKFLOW_DOCUMENT_MIME_TYPES,
  WorkflowDocumentsService,
} from '../workflows/shared/documents/workflow-documents.service';

/**
 * A file an outside caller sent with its message (an A2A file part): the bytes
 * inline (raw, base64), or an https URL we fetch. The same size and type rules
 * as an upload apply (25 MB; PDF, Word, text, Markdown, CSV, PNG, JPEG).
 */
export interface InboundFile {
  filename: string;
  mediaType: string;
  raw?: string;
  url?: string;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A file part, checked: refused with the reason rather than guessed at. */
export function inboundFile(part: Record<string, unknown>, index: number): InboundFile {
  const what = `message.parts[${index}]`;
  const mediaType = typeof part.mediaType === 'string' ? part.mediaType.split(';')[0]!.trim() : undefined;
  if (mediaType !== undefined && !WORKFLOW_DOCUMENT_MIME_TYPES.includes(mediaType)) {
    throw new Error(`${what}: ${mediaType} files are not taken (send ${WORKFLOW_DOCUMENT_MIME_TYPES.join(', ')})`);
  }
  if (typeof part.raw === 'string') {
    if (!mediaType) throw new Error(`${what}: a file sent inline needs its mediaType`);
    if (!BASE64.test(part.raw) || part.raw.length % 4 !== 0) throw new Error(`${what}: raw must be base64`);
    const bytes = (part.raw.length / 4) * 3 - (part.raw.endsWith('==') ? 2 : part.raw.endsWith('=') ? 1 : 0);
    if (bytes === 0 || bytes > WORKFLOW_DOCUMENT_MAX_BYTES) throw new Error(`${what}: a file must be between 1 byte and 25 MB`);
    return { filename: filenameOf(part.filename, 'file'), mediaType, raw: part.raw };
  }
  if (typeof part.url === 'string') {
    let url: URL;
    try {
      url = new URL(part.url);
    } catch {
      throw new Error(`${what}: url is not a URL`);
    }
    if (url.protocol !== 'https:') throw new Error(`${what}: a file's url must be https`);
    const lastSegment = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    return { filename: filenameOf(part.filename, lastSegment || 'file'), mediaType: mediaType ?? '', url: url.toString() };
  }
  throw new Error(`${what} is not a file part (raw or url)`);
}

function filenameOf(value: unknown, fallbackName: string): string {
  // A missing name is named after the URL or "file"; it only labels the document.
  const name = typeof value === 'string' && value.trim() ? value.trim() : fallbackName;
  return name.slice(0, 200);
}

/** The files a caller's message carries (data.content.files), as stored by invokeData. */
export function filesOf(content: unknown): InboundFile[] {
  const files = (content as { files?: unknown } | null)?.files;
  if (files === undefined) return [];
  if (!Array.isArray(files)) throw new Error('data.content.files must be a list of files');
  return files.map((raw, index) => {
    const file = raw as Partial<InboundFile>;
    if (typeof file.filename !== 'string' || typeof file.mediaType !== 'string' || (typeof file.raw !== 'string') === (typeof file.url !== 'string')) {
      throw new Error(`data.content.files[${index}] is not a file`);
    }
    return file as InboundFile;
  });
}

/**
 * Takes a caller's files in: fetches any sent by URL (the outbound safety
 * check, no redirects, 25 MB at most) and stores each as one of a
 * conversation's workflow documents.
 */
@Injectable()
export class InboundFilesService {
  constructor(
    private readonly documents: WorkflowDocumentsService,
    private readonly outbound: OutboundUrlValidatorService,
  ) {}

  /** Store the files as documents of `context`'s conversation (a workflow run's, or the task's for an event). */
  async store(context: ExecutionContext, files: InboundFile[]): Promise<WorkflowDocumentRef[]> {
    const refs: WorkflowDocumentRef[] = [];
    for (const file of files) {
      const { bytes, mediaType } = await this.bytesOf(file);
      refs.push(await this.documents.store(context, { buffer: bytes, originalname: file.filename, mimetype: mediaType, size: bytes.length }));
    }
    return refs;
  }

  private async bytesOf(file: InboundFile): Promise<{ bytes: Buffer; mediaType: string }> {
    if (file.raw !== undefined) return { bytes: Buffer.from(file.raw, 'base64'), mediaType: file.mediaType };
    const url = await this.outbound.assertSafe(file.url!);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (response.status !== 200) throw new Error(`Fetching ${file.filename} answered HTTP ${response.status}`);
    const served = response.headers.get('content-type')?.split(';')[0]!.trim() ?? '';
    const mediaType = file.mediaType || served;
    if (file.mediaType && served && served !== file.mediaType) {
      throw new Error(`${file.filename} was sent as ${file.mediaType} but its URL serves ${served}`);
    }
    if (!WORKFLOW_DOCUMENT_MIME_TYPES.includes(mediaType)) throw new Error(`${file.filename}: ${mediaType || 'an unknown type'} is not taken`);
    return { bytes: await readBoundedBytes(response, WORKFLOW_DOCUMENT_MAX_BYTES, file.filename), mediaType };
  }
}

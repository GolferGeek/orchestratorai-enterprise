import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ExecutionContext,
  WorkflowDocumentRef,
} from '@orchestrator-ai/transport-types';
import {
  MEDIA_STORAGE_PROVIDER,
  type MediaStorageProvider,
} from '@orchestratorai/planes/storage';

export const WORKFLOW_DOCUMENTS_BUCKET = 'workflow-documents';
export const WORKFLOW_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const WORKFLOW_DOCUMENT_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
];

/** A document ref the caller may not use: named to the caller as-is. */
export class WorkflowDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowDocumentError';
  }
}

export interface UploadedWorkflowDocument {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$/;

/**
 * Documents uploaded ahead of a workflow `start`, kept through the storage
 * plane in a private bucket at `<org>/<conversationId>/<uuid>-<name>`.
 * The folder is the ownership boundary: a run may only use refs inside its
 * own folder, and deleting the run deletes the folder.
 */
@Injectable()
export class WorkflowDocumentsService implements OnModuleInit {
  constructor(
    @Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.storage.ensureBucketExists(WORKFLOW_DOCUMENTS_BUCKET, {
      public: false,
      fileSizeLimit: WORKFLOW_DOCUMENT_MAX_BYTES,
      allowedMimeTypes: [...WORKFLOW_DOCUMENT_MIME_TYPES],
    });
  }

  async store(
    context: ExecutionContext,
    file: UploadedWorkflowDocument,
  ): Promise<WorkflowDocumentRef> {
    if (file.size <= 0 || file.size > WORKFLOW_DOCUMENT_MAX_BYTES) {
      throw new WorkflowDocumentError('Documents must be between 1 byte and 25 MB');
    }
    if (!WORKFLOW_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      throw new WorkflowDocumentError(`Document type ${file.mimetype} is not supported`);
    }
    const name = `${randomUUID()}-${safeName(file.originalname)}`;
    const ref = `${folderOf(context.orgSlug, context.conversationId)}/${name}`;
    await this.storage.upload(WORKFLOW_DOCUMENTS_BUCKET, ref, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    return { ref, filename: file.originalname, mimeType: file.mimetype };
  }

  /** Every ref must be an object in this conversation's folder. */
  async verify(context: ExecutionContext, refs: WorkflowDocumentRef[]): Promise<void> {
    if (refs.length === 0) return;
    const folder = folderOf(context.orgSlug, context.conversationId);
    const stored = new Set(
      (await this.storage.list(WORKFLOW_DOCUMENTS_BUCKET, folder)).map((entry) => entry.name),
    );
    for (const doc of refs) {
      const name = doc.ref.startsWith(`${folder}/`) ? doc.ref.slice(folder.length + 1) : '';
      if (!OBJECT_NAME.test(name) || !stored.has(name)) {
        throw new WorkflowDocumentError(
          `Document "${doc.filename}" was not uploaded to this conversation`,
        );
      }
    }
  }

  /** Remove everything uploaded for a run. */
  async removeAll(organizationSlug: string, conversationId: string): Promise<void> {
    const folder = folderOf(organizationSlug, conversationId);
    const entries = await this.storage.list(WORKFLOW_DOCUMENTS_BUCKET, folder);
    await this.storage.remove(
      WORKFLOW_DOCUMENTS_BUCKET,
      entries.map((entry) => `${folder}/${entry.name}`),
    );
  }
}

function folderOf(organizationSlug: string, conversationId: string): string {
  return `${organizationSlug}/${conversationId}`;
}

function safeName(filename: string): string {
  const cleaned = filename.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return (cleaned || 'document').slice(-120);
}

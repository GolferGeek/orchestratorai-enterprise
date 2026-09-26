import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { MediaStorageProvider } from '@orchestratorai/planes/storage';
import {
  WORKFLOW_DOCUMENTS_BUCKET,
  WorkflowDocumentError,
  WorkflowDocumentsService,
} from './workflow-documents.service';

const conversationId = '11111111-1111-4111-a111-111111111111';
const folder = `finance/${conversationId}`;
const stored = '22222222-2222-4222-a222-222222222222-brief.pdf';

function setup() {
  const storage = {
    ensureBucketExists: jest.fn(async () => undefined),
    upload: jest.fn(async (_bucket: string, path: string) => ({ path, publicUrl: 'u' })),
    list: jest.fn(async () => [{ name: stored }]),
    remove: jest.fn(async () => undefined),
  };
  const service = new WorkflowDocumentsService(storage as unknown as MediaStorageProvider);
  const context = createMockExecutionContext({
    orgSlug: 'finance',
    conversationId,
    agentType: 'workflow',
  });
  return { storage, service, context };
}

const pdf = (name: string, size = 10) => ({
  buffer: Buffer.from('x'),
  originalname: name,
  mimetype: 'application/pdf',
  size,
});

describe('WorkflowDocumentsService', () => {
  it('ensures a private bucket at boot', async () => {
    const { storage, service } = setup();
    await service.onModuleInit();
    expect(storage.ensureBucketExists).toHaveBeenCalledWith(
      WORKFLOW_DOCUMENTS_BUCKET,
      expect.objectContaining({ public: false }),
    );
  });

  it('stores under the conversation folder with a safe, unique name', async () => {
    const { storage, service, context } = setup();
    const ref = await service.store(context, pdf('../../Q3 plan.pdf'));
    expect(ref.ref).toMatch(new RegExp(`^${folder}/[0-9a-f-]{36}-_.._Q3_plan\\.pdf$`));
    expect(ref.filename).toBe('../../Q3 plan.pdf');
    expect(storage.upload).toHaveBeenCalledWith(
      WORKFLOW_DOCUMENTS_BUCKET,
      ref.ref,
      expect.any(Buffer),
      { contentType: 'application/pdf', upsert: false },
    );
  });

  it('refuses an unsupported type and an empty file', async () => {
    const { service, context } = setup();
    await expect(
      service.store(context, { ...pdf('a.exe'), mimetype: 'application/x-msdownload' }),
    ).rejects.toBeInstanceOf(WorkflowDocumentError);
    await expect(service.store(context, pdf('a.pdf', 0))).rejects.toBeInstanceOf(
      WorkflowDocumentError,
    );
  });

  it('verifies refs that exist in this conversation’s folder', async () => {
    const { service, storage, context } = setup();
    await service.verify(context, [
      { ref: `${folder}/${stored}`, filename: 'brief.pdf', mimeType: 'application/pdf' },
    ]);
    expect(storage.list).toHaveBeenCalledWith(WORKFLOW_DOCUMENTS_BUCKET, folder);
  });

  it.each([
    ['another conversation', `finance/33333333-3333-4333-a333-333333333333/${stored}`],
    ['another org', `legal/${conversationId}/${stored}`],
    ['a path escape', `${folder}/../other/${stored}`],
    ['an object that was never uploaded', `${folder}/44444444-4444-4444-a444-444444444444-x.pdf`],
  ])('refuses a ref to %s', async (_label, ref) => {
    const { service, context } = setup();
    await expect(
      service.verify(context, [{ ref, filename: 'x.pdf', mimeType: 'application/pdf' }]),
    ).rejects.toBeInstanceOf(WorkflowDocumentError);
  });

  it('removes everything in a run’s folder', async () => {
    const { service, storage } = setup();
    await service.removeAll('finance', conversationId);
    expect(storage.remove).toHaveBeenCalledWith(WORKFLOW_DOCUMENTS_BUCKET, [`${folder}/${stored}`]);
  });
});

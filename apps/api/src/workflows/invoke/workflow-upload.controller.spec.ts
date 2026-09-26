import { BadRequestException } from '@nestjs/common';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { ConversationOwnershipService } from '../../common/conversations/conversation-ownership.service';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import type { WorkflowRunsRepository } from '../shared/runs';
import {
  WorkflowDocumentError,
  type WorkflowDocumentsService,
} from '../shared/documents/workflow-documents.service';
import { WorkflowUploadController } from './workflow-upload.controller';

const file = {
  buffer: Buffer.from('x'),
  originalname: 'brief.pdf',
  mimetype: 'application/pdf',
  size: 1,
} as Express.Multer.File;

function setup() {
  const registry = new WorkflowRegistry();
  registry.register({
    slug: 'exec-digest',
    name: 'Executive Digest',
    organizationSlugs: ['finance'],
    entryPoint: {
      kind: 'runtime',
      maxAttempts: 1,
      modelRoles: [],
      accessControl: { mode: 'org' },
      parseStartInput: (input) => input,
      runTitle: () => 'digest',
    },
  });
  registry.register({
    slug: 'marketing-swarm',
    name: 'Marketing Swarm',
    organizationSlugs: ['finance'],
    entryPoint: { kind: 'custom', invoke: jest.fn(), runs: null },
  });
  const conversations = { ensure: jest.fn(async () => undefined) };
  const runs = { getForOrg: jest.fn(async (): Promise<unknown> => null) };
  const ref = { ref: 'finance/c/x-brief.pdf', filename: 'brief.pdf', mimeType: 'application/pdf' };
  const documents = { store: jest.fn(async () => ref) };
  const controller = new WorkflowUploadController(
    registry,
    conversations as unknown as ConversationOwnershipService,
    runs as unknown as WorkflowRunsRepository,
    documents as unknown as WorkflowDocumentsService,
  );
  const context = (overrides: Record<string, string> = {}) =>
    JSON.stringify(
      createMockExecutionContext({
        orgSlug: 'finance',
        userId: 'user-1',
        agentSlug: 'exec-digest',
        agentType: 'workflow',
        ...overrides,
      }),
    );
  const upload = (raw: unknown, org: string | undefined = 'finance', userId = 'user-1') =>
    controller.upload(file, raw, { id: userId }, { organizationSlug: org });
  return { upload, context, conversations, runs, documents, ref };
}

describe('WorkflowUploadController', () => {
  it('ensures the conversation and stores the file', async () => {
    const { upload, context, conversations, documents, ref } = setup();
    await expect(upload(context())).resolves.toEqual(ref);
    expect(conversations.ensure).toHaveBeenCalled();
    expect(documents.store).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }), file);
  });

  it.each([
    ['unparseable context', 'not json', 'finance', 'user-1'],
    ['another user', undefined, 'finance', 'user-2'],
    ['another org', undefined, 'legal', 'user-1'],
    ['no org selected', undefined, '*', 'user-1'],
  ])('refuses %s', async (_label, raw, org, userId) => {
    const { upload, context, documents } = setup();
    await expect(upload(raw ?? context(), org, userId)).rejects.toBeInstanceOf(BadRequestException);
    expect(documents.store).not.toHaveBeenCalled();
  });

  it('refuses a workflow that does not take documents', async () => {
    const { upload, context, documents } = setup();
    await expect(upload(context({ agentSlug: 'marketing-swarm' }))).rejects.toThrow(
      'does not take documents',
    );
    expect(documents.store).not.toHaveBeenCalled();
  });

  it('refuses uploads once the run has started', async () => {
    const { upload, context, runs, documents } = setup();
    runs.getForOrg.mockResolvedValueOnce({ id: 'c' });
    await expect(upload(context())).rejects.toThrow('already started');
    expect(documents.store).not.toHaveBeenCalled();
  });

  it('reports a rejected file as a bad request', async () => {
    const { upload, context, documents } = setup();
    documents.store.mockRejectedValueOnce(new WorkflowDocumentError('Document type x is not supported'));
    await expect(upload(context())).rejects.toThrow('Document type x is not supported');
  });
});

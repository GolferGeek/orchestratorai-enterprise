import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { WorkflowRegistry } from '../../catalog/workflow.registry';
import { WorkflowDocsController } from './workflow-docs.controller';
import { WorkflowDocMissingError, type WorkflowDocsService } from './workflow-docs.service';

const request = { organizationSlug: 'corporate' };

function setup(visible: boolean) {
  const parseStartInput = jest.fn((input) => input);
  const registry = {
    get: jest.fn(() => (visible ? { slug: 'decision-risk', entryPoint: { kind: 'runtime', parseStartInput } } : undefined)),
  } as unknown as WorkflowRegistry;
  const docs = {
    brief: jest.fn(async (_slug: string, validate?: (input: unknown) => unknown) => {
      validate?.({ proposition: 'p' });
      return { slug: 'decision-risk' };
    }),
    doc: jest.fn(async () => {
      throw new WorkflowDocMissingError('Workflow decision-risk has no smoke-test.md');
    }),
  } as unknown as WorkflowDocsService;
  return { controller: new WorkflowDocsController(registry, docs), registry, docs, parseStartInput };
}

describe('workflow docs endpoints', () => {
  it("checks the brief's examples with the workflow's own input parser", async () => {
    const { controller, registry, parseStartInput } = setup(true);
    await controller.brief('decision-risk', request);
    expect(registry.get).toHaveBeenCalledWith('decision-risk', 'corporate');
    expect(parseStartInput).toHaveBeenCalledWith({ proposition: 'p' });
  });

  it('hides a workflow the org cannot see', async () => {
    await expect(setup(false).controller.brief('decision-risk', request)).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup(false).controller.doc('decision-risk', 'user-guide', request)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an unknown doc name before touching files, and 404s a missing one', async () => {
    const { controller, docs } = setup(true);
    await expect(controller.doc('decision-risk', '../../etc/passwd', request)).rejects.toBeInstanceOf(BadRequestException);
    expect(docs.doc).not.toHaveBeenCalled();
    await expect(controller.doc('decision-risk', 'smoke-test', request)).rejects.toBeInstanceOf(NotFoundException);
  });
});

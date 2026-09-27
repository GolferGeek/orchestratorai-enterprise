import { BadRequestException, ConflictException, NotFoundException, StreamableFile } from '@nestjs/common';
import type { IssueLedgerService } from '../ledger';
import type { WorkflowRunsRepository } from '../runs';
import { ExportService } from './export.service';
import { WorkflowExportController } from './workflow-export.controller';
import { WorkflowExporterRegistry } from './workflow-exporter.registry';

const RUN_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const user = { id: 'u1' };
const request = { organizationSlug: 'corporate' };

function setup(run: Record<string, unknown> | null) {
  const getReadable = jest.fn(async () => run);
  const exporters = new WorkflowExporterRegistry();
  exporters.register({
    slug: 'decision-risk',
    fileName: () => 'report one',
    build: ({ exportedAt }) => ({ title: 'Report', generatedAt: exportedAt.toISOString(), metadata: [], sections: [] }),
  });
  const controller = new WorkflowExportController(
    { getReadable } as unknown as WorkflowRunsRepository,
    { view: async () => ({ runId: RUN_ID, issues: [], summary: {} }) } as unknown as IssueLedgerService,
    exporters,
    new ExportService(),
  );
  const headers: Record<string, string> = {};
  const response = { setHeader: (name: string, value: string) => void (headers[name] = value) };
  return { controller, getReadable, headers, response };
}

const completed = { id: RUN_ID, workflowSlug: 'decision-risk', status: 'completed' };

describe('workflow export endpoint', () => {
  it('serves the completed run as a download in the asked format', async () => {
    const { controller, getReadable, headers, response } = setup(completed);
    const file = await controller.export('decision-risk', RUN_ID, 'md', user, request, response);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(getReadable).toHaveBeenCalledWith(RUN_ID, { userId: 'u1', organizationSlug: 'corporate' });
    expect(headers).toEqual({
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="report-one.md"',
    });
  });

  it('refuses an unknown format before reading anything', async () => {
    const { controller, getReadable, response } = setup(completed);
    await expect(controller.export('decision-risk', RUN_ID, 'html', user, request, response)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.export('decision-risk', RUN_ID, undefined, user, request, response)).rejects.toBeInstanceOf(BadRequestException);
    expect(getReadable).not.toHaveBeenCalled();
  });

  it('hides a run the caller cannot read, or one of another workflow', async () => {
    await expect(setup(null).controller.export('decision-risk', RUN_ID, 'md', user, request, setup(null).response)).rejects.toBeInstanceOf(NotFoundException);
    const other = setup({ ...completed, workflowSlug: 'marketing-swarm' });
    await expect(other.controller.export('decision-risk', RUN_ID, 'md', user, request, other.response)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a workflow without an exporter, and a run that has not completed', async () => {
    const noExporter = setup({ ...completed, workflowSlug: 'marketing-swarm' });
    await expect(noExporter.controller.export('marketing-swarm', RUN_ID, 'md', user, request, noExporter.response)).rejects.toThrow('has no export');
    const running = setup({ ...completed, status: 'awaiting_review' });
    await expect(running.controller.export('decision-risk', RUN_ID, 'pdf', user, request, running.response)).rejects.toBeInstanceOf(ConflictException);
  });
});

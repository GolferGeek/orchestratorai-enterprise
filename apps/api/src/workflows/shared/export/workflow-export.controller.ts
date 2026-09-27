import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../../rbac/decorators/require-permission.decorator';
import { IssueLedgerService } from '../ledger';
import { WorkflowRunsRepository } from '../runs';
import { EXPORT_CONTENT_TYPES, EXPORT_FILE_EXTENSIONS, type ExportFormat } from './export-document';
import { ExportService } from './export.service';
import { WorkflowExporterRegistry } from './workflow-exporter.registry';

const FORMATS = Object.keys(EXPORT_CONTENT_TYPES) as ExportFormat[];

/**
 * GET /workflows/:slug/runs/:runId/export?format=md|docx|pdf — the completed
 * run's report, built by the workflow's exporter, for a caller who may read
 * the run.
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowExportController {
  constructor(
    private readonly runs: WorkflowRunsRepository,
    private readonly ledger: IssueLedgerService,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly exportService: ExportService,
  ) {}

  @Get(':slug/runs/:runId/export')
  async export(
    @Param('slug') slug: string,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Query('format') format: string | undefined,
    @CurrentUser() user: { id: string },
    @Req() request: { organizationSlug?: string },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ): Promise<StreamableFile> {
    if (!format || !(FORMATS as string[]).includes(format)) {
      throw new BadRequestException(`format must be one of ${FORMATS.join(', ')}`);
    }
    if (!request.organizationSlug) {
      throw new InternalServerErrorException('Authorized organization was not bound to the request');
    }
    const run = await this.runs.getReadable(runId, { userId: user.id, organizationSlug: request.organizationSlug });
    if (!run || run.workflowSlug !== slug) throw new NotFoundException(`No run ${runId} for workflow ${slug}`);
    const exporter = this.exporters.get(slug);
    if (!exporter) throw new NotFoundException(`Workflow ${slug} has no export`);
    if (run.status !== 'completed') {
      throw new ConflictException(`Run ${runId} is ${run.status}; only a completed run can be exported`);
    }

    const source = { run, issues: await this.ledger.view(runId), exportedAt: new Date() };
    const bytes = await this.exportService.render(exporter.build(source), format as ExportFormat);
    const fileName = `${exporter.fileName(source)}.${EXPORT_FILE_EXTENSIONS[format as ExportFormat]}`;
    response.setHeader('Content-Type', EXPORT_CONTENT_TYPES[format as ExportFormat]);
    response.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\w.-]+/g, '-')}"`);
    return new StreamableFile(bytes);
  }
}

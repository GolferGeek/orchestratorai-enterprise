import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LegalDocumentsStorageService } from '../jobs/legal-documents-storage.service';
import { LegalJobsRepository } from '../jobs/legal-jobs.repository';
import {
  MATTER_DOCS_INGEST_JOB_TYPE,
  MATTER_FACTS_INGEST_JOB_TYPE,
} from '../jobs/legal-jobs.types';
import { MatterRepository } from './matter.repository';
import type {
  CreateMatterDto,
  EntityType,
  MatterDocumentRow,
  MatterEntityRow,
  MatterRow,
  MatterStatus,
  MatterTimelineRow,
  UpdateMatterDto,
  UploadDocumentResponse,
} from './matter.types';
import type { AgentJobRow } from '../jobs/legal-jobs.types';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

@Injectable()
export class MatterService {
  private readonly logger = new Logger(MatterService.name);

  constructor(
    private readonly matterRepo: MatterRepository,
    private readonly jobsRepo: LegalJobsRepository,
    private readonly storage: LegalDocumentsStorageService,
  ) {}

  async createMatter(dto: CreateMatterDto): Promise<MatterRow> {
    return this.matterRepo.createMatter(dto);
  }

  async listMatters(
    orgSlug: string,
    status?: MatterStatus,
  ): Promise<MatterRow[]> {
    return this.matterRepo.listMatters(orgSlug, status);
  }

  async getMatter(id: string, orgSlug: string): Promise<MatterRow> {
    return this.matterRepo.getMatterById(id, orgSlug);
  }

  async updateMatter(
    id: string,
    orgSlug: string,
    dto: UpdateMatterDto,
  ): Promise<MatterRow> {
    return this.matterRepo.updateMatter(id, orgSlug, dto);
  }

  async uploadDocument(
    matterId: string,
    context: ExecutionContext,
    file: Express.Multer.File,
  ): Promise<UploadDocumentResponse> {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File exceeds the maximum allowed size of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
      );
    }

    await this.matterRepo.assertMatterOwnership(matterId, context.orgSlug);

    const documentId = randomUUID();
    const storagePath = `matters/${matterId}/documents/${documentId}/${file.originalname}`;

    await this.storage.storeOriginal(
      `matters/${matterId}/documents/${documentId}`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    await this.matterRepo.insertDocument({
      matterId,
      orgSlug: context.orgSlug,
      storagePath,
      originalName: file.originalname,
      uploadedBy: context.userId,
    });

    const factsConvId = `matter-${matterId}-facts-${documentId}`;
    const docsConvId = `matter-${matterId}-docs-${documentId}`;

    const factsJobInput = {
      context,
      data: {
        content: '',
        matterId,
        documentId,
        storagePath,
      },
      metadata: { jobType: MATTER_FACTS_INGEST_JOB_TYPE },
    };

    const docsJobInput = {
      context,
      data: {
        content: '',
        matterId,
        documentId,
        storagePath,
      },
      metadata: { jobType: MATTER_DOCS_INGEST_JOB_TYPE },
    };

    const [factsJob, docsJob] = await Promise.all([
      this.jobsRepo.insertQueued(factsJobInput, factsConvId),
      this.jobsRepo.insertQueued(docsJobInput, docsConvId),
    ]);

    return {
      documentId,
      storagePath,
      factsJobId: factsJob.id,
      docsJobId: docsJob.id,
    };
  }

  async listDocuments(
    matterId: string,
    orgSlug: string,
  ): Promise<MatterDocumentRow[]> {
    await this.assertOwnership(matterId, orgSlug);
    return this.matterRepo.listDocuments(matterId, orgSlug);
  }

  async listEntities(
    matterId: string,
    orgSlug: string,
    entityType?: EntityType,
  ): Promise<MatterEntityRow[]> {
    await this.assertOwnership(matterId, orgSlug);
    return this.matterRepo.listEntities(matterId, orgSlug, entityType);
  }

  async listTimeline(
    matterId: string,
    orgSlug: string,
  ): Promise<MatterTimelineRow[]> {
    await this.assertOwnership(matterId, orgSlug);
    return this.matterRepo.listTimeline(matterId, orgSlug);
  }

  async listJobs(
    matterId: string,
    orgSlug: string,
    status?: string,
  ): Promise<AgentJobRow[]> {
    await this.assertOwnership(matterId, orgSlug);

    const [factsJobs, docsJobs] = await Promise.all([
      this.jobsRepo.listForOrg(orgSlug, {
        jobType: MATTER_FACTS_INGEST_JOB_TYPE,
        status: status as AgentJobRow['status'] | undefined,
        limit: 200,
      }),
      this.jobsRepo.listForOrg(orgSlug, {
        jobType: MATTER_DOCS_INGEST_JOB_TYPE,
        status: status as AgentJobRow['status'] | undefined,
        limit: 200,
      }),
    ]);

    const allJobs = [...factsJobs, ...docsJobs];
    return allJobs.filter((job) => {
      const data = job.input?.data as Record<string, unknown> | undefined;
      return data?.matterId === matterId;
    });
  }

  private async assertOwnership(
    matterId: string,
    orgSlug: string,
  ): Promise<void> {
    const matter = await this.matterRepo.getMatterById(matterId, orgSlug);
    if (matter.org_slug !== orgSlug) {
      throw new ForbiddenException(
        `Matter ${matterId} does not belong to org ${orgSlug}`,
      );
    }
  }
}

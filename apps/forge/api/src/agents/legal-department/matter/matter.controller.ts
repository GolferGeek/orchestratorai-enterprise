import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  InProcessJwtAuthGuard as JwtAuthGuard,
  InProcessRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { MatterService } from './matter.service';
import type {
  CreateMatterDto,
  EntityType,
  MatterStatus,
  UpdateMatterDto,
} from './matter.types';

@Controller('legal-department/matters')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class MatterController {
  constructor(private readonly matterService: MatterService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMatter(@Body() dto: CreateMatterDto) {
    return this.matterService.createMatter(dto);
  }

  @Get()
  async listMatters(
    @Query('status') status: string | undefined,
    @Query('orgSlug') orgSlug: string | undefined,
    @Body('context') bodyContext: ExecutionContext | undefined,
  ) {
    const resolvedOrgSlug = orgSlug ?? bodyContext?.orgSlug;
    if (!resolvedOrgSlug) {
      throw new BadRequestException('context.orgSlug or orgSlug query param is required');
    }
    return this.matterService.listMatters(
      resolvedOrgSlug,
      status as MatterStatus | undefined,
    );
  }

  @Get(':id')
  async getMatter(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Body('context') bodyContext: ExecutionContext | undefined,
  ) {
    const resolvedOrgSlug = orgSlug ?? bodyContext?.orgSlug;
    if (!resolvedOrgSlug) {
      throw new BadRequestException('context.orgSlug or orgSlug query param is required');
    }
    return this.matterService.getMatter(id, resolvedOrgSlug);
  }

  @Patch(':id')
  async updateMatter(@Param('id') id: string, @Body() dto: UpdateMatterDto) {
    return this.matterService.updateMatter(id, dto.context.orgSlug, dto);
  }

  @Post(':id/documents')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('id') matterId: string,
    @Body('context') contextJson: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('file (multipart field) is required');
    }
    if (!contextJson) {
      throw new BadRequestException(
        'context (JSON string multipart field) is required',
      );
    }

    let context: ExecutionContext;
    try {
      context = JSON.parse(contextJson) as ExecutionContext;
    } catch {
      throw new BadRequestException('context field must be valid JSON');
    }

    return this.matterService.uploadDocument(matterId, context, file);
  }

  @Get(':id/documents')
  async listDocuments(
    @Param('id') matterId: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Body('context') bodyContext: ExecutionContext | undefined,
  ) {
    const resolvedOrgSlug = orgSlug ?? bodyContext?.orgSlug;
    if (!resolvedOrgSlug) {
      throw new BadRequestException('context.orgSlug or orgSlug query param is required');
    }
    return this.matterService.listDocuments(matterId, resolvedOrgSlug);
  }

  @Get(':id/entities')
  async listEntities(
    @Param('id') matterId: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('type') entityType: string | undefined,
    @Body('context') bodyContext: ExecutionContext | undefined,
  ) {
    const resolvedOrgSlug = orgSlug ?? bodyContext?.orgSlug;
    if (!resolvedOrgSlug) {
      throw new BadRequestException('context.orgSlug or orgSlug query param is required');
    }
    return this.matterService.listEntities(
      matterId,
      resolvedOrgSlug,
      entityType as EntityType | undefined,
    );
  }

  @Get(':id/timeline')
  async listTimeline(
    @Param('id') matterId: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Body('context') bodyContext: ExecutionContext | undefined,
  ) {
    const resolvedOrgSlug = orgSlug ?? bodyContext?.orgSlug;
    if (!resolvedOrgSlug) {
      throw new BadRequestException('context.orgSlug or orgSlug query param is required');
    }
    return this.matterService.listTimeline(matterId, resolvedOrgSlug);
  }

  @Get(':id/jobs')
  async listJobs(
    @Param('id') matterId: string,
    @Query('orgSlug') orgSlug: string | undefined,
    @Query('status') status: string | undefined,
    @Body('context') bodyContext: ExecutionContext | undefined,
  ) {
    const resolvedOrgSlug = orgSlug ?? bodyContext?.orgSlug;
    if (!resolvedOrgSlug) {
      throw new BadRequestException('context.orgSlug or orgSlug query param is required');
    }
    return this.matterService.listJobs(matterId, resolvedOrgSlug, status);
  }
}

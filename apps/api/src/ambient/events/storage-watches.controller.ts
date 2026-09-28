import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AmbientDatabaseService, StorageWatch } from '../ambient-database/database.service';
import { EVENT_NAME } from './ambient-events.service';

/** Watched storage folders of the caller's organization: a new file raises the watch's event. */
@Controller('ambient/storage-watches')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class StorageWatchesController {
  constructor(private readonly db: AmbientDatabaseService) {}

  @Get()
  list(@Req() request: Request): Promise<StorageWatch[]> {
    return this.db.listStorageWatches(orgOf(request));
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown, @CurrentUser() user: { id: string }): Promise<StorageWatch> {
    const { bucket, prefix, event, ...rest } = (body ?? {}) as Record<string, unknown>;
    const extra = Object.keys(rest);
    if (extra.length > 0) throw new BadRequestException(`Unknown fields: ${extra.join(', ')}`);
    if (typeof bucket !== 'string' || !bucket) throw new BadRequestException('bucket is required');
    const folder = prefix === undefined ? '' : prefix;
    if (typeof folder !== 'string' || (folder !== '' && !/^[^/].*\/$/.test(folder))) {
      throw new BadRequestException("prefix is a folder in the bucket ending in '/', e.g. invoices/ (or empty for the whole bucket)");
    }
    if (typeof event !== 'string' || !EVENT_NAME.test(event)) {
      throw new BadRequestException("event must be lowercase words joined by '.', '_' or '-', e.g. invoice.received");
    }
    if (!(await this.db.bucketExists(bucket))) throw new BadRequestException(`There is no storage bucket ${bucket}`);
    return this.db.createStorageWatch({ org_slug: orgOf(request), bucket, prefix: folder, event, created_by: user.id });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    if (!(await this.db.deleteStorageWatch(id, orgOf(request)))) throw new NotFoundException(`Storage watch ${id} not found`);
  }
}

function orgOf(request: Request): string {
  const orgSlug = (request as Request & { organizationSlug?: string }).organizationSlug;
  if (!orgSlug || orgSlug === '*') throw new BadRequestException('A specific authorized organization is required');
  return orgSlug;
}

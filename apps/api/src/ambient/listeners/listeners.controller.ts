import { Controller, Get, Post, Param, Body, NotFoundException, BadRequestException, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { ListenerRegistryService } from './listener-registry.service';
import { DbWatcherService } from './db-watcher.service';
import { FileWatcherService } from './file-watcher.service';

@Controller('ambient/listeners')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class ListenersController {
  constructor(
    private readonly registry: ListenerRegistryService,
    private readonly dbWatcher: DbWatcherService,
    private readonly fileWatcher: FileWatcherService,
  ) {}

  @Get()
  getAll() {
    return this.registry.getAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const listener = this.registry.getById(id);
    if (!listener) {
      throw new NotFoundException(`Listener ${id} not found`);
    }
    return listener;
  }

  /**
   * Simulate a DB event (for development/demo use).
   */
  @Post('simulate/db')
  simulateDb(
    @Req() request: Request,
    @Body()
    body: {
      table: string;
      eventType: 'INSERT' | 'UPDATE' | 'DELETE';
      payload?: Record<string, unknown>;
    },
  ) {
    this.dbWatcher.simulateEvent(
      this.getOrganizationSlug(request),
      body.table,
      body.eventType,
      body.payload ?? {},
    );
    return { accepted: true, table: body.table, eventType: body.eventType };
  }

  /**
   * Simulate a file system event (for development/demo use).
   */
  @Post('simulate/file')
  simulateFile(
    @Req() request: Request,
    @Body()
    body: {
      path: string;
      eventType: 'created' | 'modified' | 'deleted';
    },
  ) {
    this.fileWatcher.simulateEvent(
      this.getOrganizationSlug(request),
      body.path,
      body.eventType,
    );
    return { accepted: true, path: body.path, eventType: body.eventType };
  }

  private getOrganizationSlug(request: Request): string {
    const orgSlug = (request as Request & { organizationSlug?: string })
      .organizationSlug;
    if (!orgSlug || orgSlug === '*') {
      throw new BadRequestException(
        'A specific authorized organization is required',
      );
    }
    return orgSlug;
  }
}

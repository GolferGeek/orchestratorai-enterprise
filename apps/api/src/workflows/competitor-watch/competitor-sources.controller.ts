import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { type CompetitorSource, SourcesStoreService } from './sources-store.service';

/**
 * The pages the org's competitor watch follows, in the RBAC org:
 * GET / POST { competitor, page, url } / DELETE :id  on /workflows/competitor-watch/sources
 */
@Controller('workflows/competitor-watch/sources')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class CompetitorSourcesController {
  constructor(private readonly store: SourcesStoreService) {}

  @Get()
  async list(@Req() request: { organizationSlug?: string }): Promise<CompetitorSource[]> {
    return this.store.list(this.org(request));
  }

  @Post()
  async add(
    @Body() body: { competitor?: unknown; page?: unknown; url?: unknown },
    @CurrentUser() user: { id: string },
    @Req() request: { organizationSlug?: string },
  ): Promise<CompetitorSource> {
    const competitor = typeof body.competitor === 'string' ? body.competitor.trim() : '';
    const page = typeof body.page === 'string' ? body.page.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!competitor || !page) throw new BadRequestException('competitor and page are required');
    if (!/^https:\/\/[^\s]+$/.test(url)) throw new BadRequestException('url must be an https:// address');
    return this.store.add(this.org(request), { competitor, page, url }, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: { organizationSlug?: string }): Promise<void> {
    if (!(await this.store.remove(this.org(request), id))) throw new NotFoundException(`No source ${id}`);
  }

  private org(request: { organizationSlug?: string }): string {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization');
    return org;
  }
}

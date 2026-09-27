import { BadRequestException, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { SpecLibraryService } from './spec-library.service';

/** GET /workflows/submittal-review/spec-sections: the RBAC org's project manual sections. */
@Controller('workflows/submittal-review/spec-sections')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class SpecSectionsController {
  constructor(private readonly specs: SpecLibraryService) {}

  @Get()
  async list(@Req() request: { organizationSlug?: string }) {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization');
    return (await this.specs.sections(org)).map(({ section, title }) => ({ section, title }));
  }
}

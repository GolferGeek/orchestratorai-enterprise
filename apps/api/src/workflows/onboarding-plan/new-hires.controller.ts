import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { WorkflowInputError } from '../catalog/workflow.registry';
import { HiresStoreService, type NewHire, type NewHireFields } from './hires-store.service';
import { parseNewHire } from './onboarding.input';

/**
 * HR's new hires, in the RBAC org: GET lists them (with their onboarding
 * runs), POST records one - which starts the onboarding plan through the
 * ambient database trigger on hr.new_hires.
 */
@Controller('workflows/onboarding-plan/new-hires')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class NewHiresController {
  constructor(private readonly hires: HiresStoreService) {}

  @Get()
  async list(@Req() request: { organizationSlug?: string }): Promise<NewHire[]> {
    return this.hires.list(this.org(request));
  }

  @Post()
  async add(@Body() body: unknown, @CurrentUser() user: { id: string }, @Req() request: { organizationSlug?: string }): Promise<NewHire> {
    let hire: NewHireFields;
    try {
      hire = parseNewHire(body);
    } catch (error) {
      if (error instanceof WorkflowInputError) throw new BadRequestException(error.message);
      throw error;
    }
    return this.hires.add(this.org(request), hire, user.id);
  }

  private org(request: { organizationSlug?: string }): string {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization');
    return org;
  }
}

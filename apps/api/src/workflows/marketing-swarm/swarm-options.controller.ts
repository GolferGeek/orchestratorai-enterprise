import { BadRequestException, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { SwarmStoreService } from './swarm-store.service';

export interface SwarmOptions {
  contentTypes: Array<{ slug: string; name: string; minWords: number; maxWords: number; maxChars: number | null }>;
  writers: Array<{ slug: string; name: string; description: string | null; model: string }>;
  editors: Array<{ slug: string; name: string; description: string | null }>;
  evaluators: Array<{ slug: string; name: string; description: string | null }>;
}

/**
 * GET /workflows/marketing-swarm/options: what the org offers for a new run
 * (active content types, writers, editors and evaluators), for the run form.
 * Admins change them in the workflow's admin.
 */
@Controller('workflows/marketing-swarm/options')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class SwarmOptionsController {
  constructor(private readonly store: SwarmStoreService) {}

  @Get()
  async options(@Req() request: { organizationSlug?: string }): Promise<SwarmOptions> {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization');
    const [types, writers, editors, evaluators] = await Promise.all([
      this.store.select('swarm_content_types', org),
      this.store.select('swarm_writers', org),
      this.store.select('swarm_editors', org),
      this.store.select('swarm_evaluators', org),
    ]);
    const active = <T extends Record<string, unknown>>(rows: T[]) => rows.filter((r) => r.active === true);
    const describe = (r: Record<string, unknown>) => ({ slug: String(r.slug), name: String(r.name), description: typeof r.description === 'string' ? r.description : null });
    return {
      contentTypes: active(types).map((r) => ({ slug: String(r.slug), name: String(r.name), minWords: Number(r.min_words), maxWords: Number(r.max_words), maxChars: r.max_chars === null ? null : Number(r.max_chars) })),
      writers: active(writers).map((r) => ({ ...describe(r), model: `${String(r.provider)}/${String(r.model)}` })),
      editors: active(editors).map(describe),
      evaluators: active(evaluators).map(describe),
    };
  }
}

import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Query,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RequirePermission } from '@/rbac/decorators/require-permission.decorator';
import type { JsonObject } from '@orchestrator-ai/transport-types';
import {
  CreateAgentDto,
  UpdateAgentDto,
  AgentType as DtoAgentType,
} from '../dto/agent-admin.dto';
import type { AgentType } from '../schemas/agent-schemas';
import { AgentValidationService } from '../services/agent-validation.service';
import { AgentsRepository } from '../repositories/agents.repository';
import { AgentDryRunService } from '../services/agent-dry-run.service';
import { AgentPolicyService } from '../services/agent-policy.service';
import { AgentPromotionService } from '../services/agent-promotion.service';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    id?: string;
    userId?: string;
  };
}

interface AgentRecord {
  id: string;
  organization_slug: string;
  slug: string;
  display_name: string;
  agent_type: string;
  mode_profile: string;
  yaml: string;
  description: string | null;
  agent_card: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
}

interface SmokeRunResult {
  file: string;
  success: boolean;
  issues: Array<{ message: string }>;
  dryRun?: { ok: boolean; error?: string };
}

@Controller('api/admin/agents')
@UseGuards(JwtAuthGuard)
export class AgentsAdminController {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly validator: AgentValidationService,
    private readonly agents: AgentsRepository,
    private readonly dryRun: AgentDryRunService,
    private readonly policy: AgentPolicyService,
    private readonly promotion: AgentPromotionService,
  ) {}

  @Get()
  @RequirePermission('agents:admin')
  async list(@Query('type') type?: string) {
    let q = this.db.from(null, 'agents').select('*');
    if (type) q = q.eq('agent_type', type);
    const { data, error } = (await q) as QueryResult<unknown>;
    if (error) throw new Error(error.message);
    return { success: true, data };
  }

  @Post()
  @RequirePermission('agents:admin')
  async upsert(@Body() dto: CreateAgentDto) {
    // Run JSON-schema validation by type
    const type = dto.agent_type;
    // Validate using the agent type from DTO
    const { ok, issues } = this.validator.validateByType(
      type,
      dto as unknown as Parameters<typeof this.validator.validateByType>[1],
    );
    const policyIssues = this.policy.check(
      dto as unknown as Parameters<typeof this.policy.check>[0],
    );
    if (!ok || policyIssues.length) {
      return { success: false, issues: [...issues, ...policyIssues] };
    }

    // Normalize organization_slug to array
    const organization_slug = dto.organization_slug
      ? Array.isArray(dto.organization_slug)
        ? dto.organization_slug
        : [dto.organization_slug]
      : [];

    const record = await this.agents.upsert({
      organization_slug,
      slug: dto.slug,
      name: dto.display_name || dto.slug,
      description: dto.description || '',
      agent_type: dto.agent_type as 'context' | 'api' | 'external',
      department: dto.department || 'general',
      version: dto.version || '1.0.0',
      tags: dto.tags || [],
      capabilities: dto.capabilities || [],
      context: dto.context || '',
      io_schema: (dto.io_schema as JsonObject) || {},
      endpoint: (dto.endpoint as JsonObject) || null,
      llm_config: (dto.llm_config as JsonObject) || null,
      metadata: (dto.metadata as JsonObject) || {},
    });

    return { success: true, data: record };
  }

  @Post('validate')
  @RequirePermission('agents:admin')
  validate(@Body() dto: CreateAgentDto, @Query('dryRun') dryRun?: string) {
    const type = dto.agent_type;
    // Validate using the agent type from DTO
    const validation = this.validator.validateByType(
      type,
      dto as unknown as Parameters<typeof this.validator.validateByType>[1],
    );
    const policyIssues = this.policy.check(
      dto as unknown as Parameters<typeof this.policy.check>[0],
    );

    const response: {
      success: boolean;
      issues: Array<{ message: string }>;
      dryRun?: { ok: boolean; error?: string };
    } = {
      success: validation.ok && policyIssues.length === 0,
      issues: [...validation.issues, ...policyIssues],
    };
    const wantsDryRun = (dryRun || '').toString().toLowerCase() === 'true';

    if (validation.ok && wantsDryRun && type === DtoAgentType.API) {
      const config = dto.metadata;
      const configuration = config?.configuration as
        | Record<string, unknown>
        | undefined;
      const apiConfig = configuration?.api as
        | Record<string, unknown>
        | undefined;
      const apiCfg = apiConfig?.api_configuration;
      if (apiCfg) {
        const sampleInput = apiConfig?.sample_input || {
          sessionId: 'dryrun',
          userMessage: 'hello',
        };
        const sampleResp = apiConfig?.sample_response || {
          output: 'dry-run-ok',
        };
        response.dryRun = this.dryRun.runApiTransform(
          apiCfg,
          sampleInput,
          sampleResp,
        );
      } else {
        response.dryRun = {
          ok: false,
          error: 'No api_configuration provided for dry-run',
        };
      }
    }
    return response;
  }

  @Patch(':id')
  @RequirePermission('agents:admin')
  async patch(@Param('id') id: string, @Body() body: UpdateAgentDto) {
    // Load current to determine type for validation
    const result = await this.db
      .from(null, 'agents')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error('Agent not found');

    const current = result.data as AgentRecord;

    const next = {
      display_name: body.display_name ?? current.display_name,
      mode_profile: body.mode_profile ?? current.mode_profile,
      yaml: body.yaml ?? current.yaml,
      description: body.description ?? current.description,
      agent_card: body.agent_card ?? current.agent_card,
      context: body.context ?? current.context,
      config: body.config ?? current.config,
    };

    // Validate merged payload
    // Cast to unknown first to bypass type incompatibility
    const createLike = {
      organization_slug: current.organization_slug,
      slug: current.slug,
      display_name: next.display_name,
      agent_type: current.agent_type,
      mode_profile: next.mode_profile,
      yaml: next.yaml,
      description: next.description,
      agent_card: next.agent_card,
      context: next.context,
      config: next.config,
    } as unknown as CreateAgentDto;

    // Validate using the agent type from current record
    const validation = this.validator.validateByType(
      current.agent_type as AgentType,
      createLike as unknown as Parameters<
        typeof this.validator.validateByType
      >[1],
    );
    const policyIssues = this.policy.check(
      createLike as unknown as Parameters<typeof this.policy.check>[0],
    );
    if (!validation.ok || policyIssues.length) {
      return {
        success: false,
        issues: [...validation.issues, ...policyIssues],
      };
    }

    const updateResult = await this.db
      .from(null, 'agents')
      .update(next)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (updateResult.error) throw new Error(updateResult.error.message);
    return { success: true, data: updateResult.data as AgentRecord | null };
  }

  @Patch(':slug/test-config')
  @RequirePermission('agents:admin')
  async patchTestConfig(
    @Param('slug') slug: string,
    @Body() body: { test_config: Record<string, unknown> | null },
  ) {
    // Load current agent by slug
    const result = await this.db
      .from(null, 'agents')
      .select('id, metadata')
      .eq('slug', slug)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error(`Agent ${slug} not found`);

    const current = result.data as {
      id: string;
      metadata: Record<string, unknown> | null;
    };
    const metadata = { ...(current.metadata ?? {}) };

    if (body.test_config === null) {
      delete metadata.test_config;
    } else {
      metadata.test_config = body.test_config;
    }

    const updateResult = await this.db
      .from(null, 'agents')
      .update({ metadata })
      .eq('id', current.id)
      .select('slug, metadata')
      .maybeSingle();
    if (updateResult.error) throw new Error(updateResult.error.message);
    return { success: true, data: updateResult.data as unknown };
  }

  @Post('smoke-run')
  @RequirePermission('agents:admin')
  async smokeRun() {
    const root = resolve(__dirname, '../../../../..');
    const files = [
      resolve(root, 'docs/feature/matt/payloads/blog_post_writer.json'),
      resolve(root, 'docs/feature/matt/payloads/hr_assistant.json'),
      resolve(
        root,
        'docs/feature/matt/payloads/agent_builder_orchestrator.json',
      ),
    ];

    const results: SmokeRunResult[] = [];
    for (const f of files) {
      try {
        const raw = await readFile(f, 'utf8');
        const dto = JSON.parse(raw) as CreateAgentDto;
        const type = dto.agent_type;
        // Validate using the agent type from DTO
        const validation = this.validator.validateByType(
          type,
          dto as unknown as Parameters<typeof this.validator.validateByType>[1],
        );
        const policyIssues = this.policy.check(
          dto as unknown as Parameters<typeof this.policy.check>[0],
        );
        const item: SmokeRunResult = {
          file: f,
          success: validation.ok && policyIssues.length === 0,
          issues: [...validation.issues, ...policyIssues],
        };
        if (item.success && type === DtoAgentType.API) {
          const metadataConfig = dto.metadata;
          const configuration = metadataConfig?.configuration as
            | Record<string, unknown>
            | undefined;
          const apiConfig = configuration?.api as
            | Record<string, unknown>
            | undefined;
          const apiCfg = apiConfig?.api_configuration;
          if (apiCfg) {
            item.dryRun = this.dryRun.runApiTransform(
              apiCfg,
              apiConfig?.sample_input || {
                sessionId: 'dryrun',
                userMessage: 'hello',
              },
              apiConfig?.sample_response || {
                output: 'ok',
              },
            );
          }
        }
        results.push(item);
      } catch (e) {
        const error = e as Error;
        results.push({
          file: f,
          success: false,
          issues: [{ message: error.message || String(e) }],
        });
      }
    }

    const allOk = results.every(
      (r) => r.success && (!r.dryRun || r.dryRun.ok !== false),
    );
    return { success: allOk, results };
  }

  // === Promotion Endpoints ===

  @Post(':id/promote')
  @RequirePermission('agents:admin')
  async requestPromotion(
    @Param('id') id: string,
    @Body() body: { requireApproval?: boolean; skipValidation?: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.sub || req.user?.id || req.user?.userId;
    const result = await this.promotion.requestPromotion(id, {
      requireApproval: body.requireApproval,
      skipValidation: body.skipValidation,
      requestedBy: userId,
    });
    return result;
  }

  @Post(':id/demote')
  @RequirePermission('agents:admin')
  async demote(@Param('id') id: string, @Body() body: { reason?: string }) {
    const result = await this.promotion.demote(id, body.reason);
    return result;
  }

  @Post(':id/archive')
  @RequirePermission('agents:admin')
  async archive(@Param('id') id: string, @Body() body: { reason?: string }) {
    const result = await this.promotion.archive(id, body.reason);
    return result;
  }

  @Get(':id/promotion-requirements')
  @RequirePermission('agents:admin')
  async getPromotionRequirements(@Param('id') id: string) {
    const requirements = await this.promotion.getPromotionRequirements(id);
    return { success: true, data: requirements };
  }
}

import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Public } from '@/auth/decorators/public.decorator';
import { RequirePermission } from '@/rbac/decorators/require-permission.decorator';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import type { DashboardRequestPayload } from '../../shared/types/forge-types';
import { PredictorService } from '../predictor.service';

interface AnalystRow {
  id: string;
  slug: string;
  name: string;
  perspective: string;
  tier_instructions: Record<string, unknown>;
  scope_level: string;
  domain: string | null;
  universe_id: string | null;
  target_id: string | null;
  default_weight: number;
  is_enabled: boolean;
  analyst_type: string | null;
  created_at: string;
  updated_at: string;
}

interface TargetRow {
  id: string;
  universe_id: string;
  symbol: string;
  name: string;
  target_type: string;
  context: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UniverseRow {
  id: string;
  name: string;
  domain: string;
  organization_slug: string;
  agent_slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

@Controller('api/prediction/context')
@UseGuards(JwtAuthGuard)
export class PredictionContextController {
  private readonly logger = new Logger(PredictionContextController.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly predictorService: PredictorService,
  ) {}

  // ── Analysts ─────────────────────────────────────────────────────────────

  @Get('analysts')
  @RequirePermission('agents:admin')
  async listAnalysts() {
    const { data, error } = (await this.db
      .from('prediction', 'analysts')
      .select('*')
      .or('is_test_data.is.null,is_test_data.eq.false')
      .order('scope_level')
      .order('name')) as QueryResult<unknown>;

    if (error) throw new Error(error.message);
    return { success: true, data: data as AnalystRow[] };
  }

  @Patch('analysts/:id')
  @RequirePermission('agents:admin')
  async patchAnalyst(
    @Param('id') id: string,
    @Body()
    body: {
      perspective?: string;
      tier_instructions?: Record<string, unknown>;
      is_enabled?: boolean;
    },
  ) {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.perspective !== undefined) update.perspective = body.perspective;
    if (body.tier_instructions !== undefined)
      update.tier_instructions = body.tier_instructions;
    if (body.is_enabled !== undefined) update.is_enabled = body.is_enabled;

    const response = await this.db
      .from('prediction', 'analysts')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (response.error) throw new Error(response.error.message);
    return { success: true, data: response.data as AnalystRow };
  }

  // ── Targets ──────────────────────────────────────────────────────────────

  @Get('targets')
  @RequirePermission('agents:admin')
  async listTargets() {
    const { data, error } = (await this.db
      .from('prediction', 'targets')
      .select('*')
      .or('is_test_data.is.null,is_test_data.eq.false')
      .order('symbol')) as QueryResult<unknown>;

    if (error) throw new Error(error.message);
    return { success: true, data: data as TargetRow[] };
  }

  @Patch('targets/:id')
  @RequirePermission('agents:admin')
  async patchTarget(
    @Param('id') id: string,
    @Body() body: { context?: string; name?: string },
  ) {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.context !== undefined) update.context = body.context;
    if (body.name !== undefined) update.name = body.name;

    const response = await this.db
      .from('prediction', 'targets')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (response.error) throw new Error(response.error.message);
    return { success: true, data: response.data as TargetRow };
  }

  // ── Universes ─────────────────────────────────────────────────────────────

  @Get('universes')
  @RequirePermission('agents:admin')
  async listUniverses() {
    const { data, error } = (await this.db
      .from('prediction', 'universes')
      .select('*')
      .order('name')) as QueryResult<unknown>;

    if (error) throw new Error(error.message);
    return { success: true, data: data as UniverseRow[] };
  }

  // ── Runner Triggers (dev/admin) ────────────────────────────────────────

  /**
   * Trigger a predictor runner.
   * POST /api/prediction/context/trigger/:runner
   *
   * Available runners:
   *   Batch: signal-generator, batch-prediction, outcome-tracking, evaluation
   *   Event-driven: process-article, evaluate-predictor
   *
   * Accepts both direct calls ({ payload }) and JSON-RPC 2.0 from Pulse trigger executor
   * ({ jsonrpc: "2.0", params: { payload: { event: { new: { id: "..." } } } } }).
   */
  @Post('trigger/:runner')
  @Public()
  async triggerRunner(
    @Param('runner') runner: string,
    @Body() body?: Record<string, unknown>,
  ) {
    this.logger.log(`Trigger for runner: ${runner}`);

    // Extract payload — support both JSON-RPC 2.0 and direct formats
    let payload: Record<string, unknown> | undefined;
    if (body?.jsonrpc === '2.0') {
      // JSON-RPC format from Pulse trigger executor
      const params = body.params as Record<string, unknown> | undefined;
      payload = params?.payload as Record<string, unknown> | undefined;
    } else if (body?.payload) {
      payload = body.payload as Record<string, unknown>;
    } else if (body?.event) {
      payload = { event: body.event as Record<string, unknown> };
    }

    const result = await this.predictorService.process({
      context: {
        orgSlug: 'global',
        userId: 'system',
        conversationId: `trigger-${runner}-${Date.now()}`,
        agentSlug: 'predictor',
        agentType: 'langgraph',
        provider: 'default',
        model: 'default',
      },
      mode: 'runner',
      action: runner,
      payload: payload as unknown as DashboardRequestPayload,
    });

    return result;
  }
}

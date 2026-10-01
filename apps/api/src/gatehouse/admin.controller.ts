import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { A2AAgentRefused, A2AAgentsService } from './a2a-agents.service';
import type { TaskState } from './a2a-inbound';
import { OutboundCallsRepository } from './outbound-calls.repository';
import { TasksRepository } from './tasks.repository';

const TASK_STATES: TaskState[] = ['submitted', 'working', 'completed', 'failed', 'canceled', 'rejected'];

/**
 * The Gatehouse pages: the org's A2A agents (managed by an agent admin), and
 * what crossed the boundary (read with audit access): inbound tasks and
 * outbound calls. An admin of every organization ('*') sees every org.
 */
@Controller('gatehouse')
@UseGuards(JwtAuthGuard, RbacGuard)
export class GatehouseAdminController {
  constructor(
    private readonly agents: A2AAgentsService,
    private readonly tasks: TasksRepository,
    private readonly outbound: OutboundCallsRepository,
  ) {}

  @Get('agents')
  @RequirePermission('agents:admin')
  list(@Req() request: Request) {
    return this.agents.list(orgOf(request));
  }

  @Get('agents/:slug')
  @RequirePermission('agents:admin')
  get(@Req() request: Request, @Param('slug') slug: string) {
    return refused(this.agents.get(slug, orgOf(request)));
  }

  /** A new A2A agent, disabled until an admin publishes it. Body: {slug, name, description, a2a, orgSlug?}. */
  @Post('agents')
  @RequirePermission('agents:admin')
  create(@Req() request: Request, @Body() body: unknown) {
    const { slug, orgSlug, ...draft } = record(body);
    const org = orgOf(request);
    const target = org === '*' ? orgSlug : org;
    if (typeof target !== 'string' || !target) throw new BadRequestException('orgSlug is required for an admin of every organization');
    if (typeof slug !== 'string') throw new BadRequestException('slug is required');
    return refused(this.agents.create(target, slug, draft));
  }

  @Put('agents/:slug')
  @RequirePermission('agents:admin')
  update(@Req() request: Request, @Param('slug') slug: string, @Body() body: unknown) {
    return refused(this.agents.update(slug, orgOf(request), record(body)));
  }

  /** Publish (active), hold back (disabled) or retire (archived). Body: {status}. */
  @Patch('agents/:slug/status')
  @RequirePermission('agents:admin')
  setStatus(@Req() request: Request, @Param('slug') slug: string, @Body() body: unknown) {
    return refused(this.agents.setStatus(slug, orgOf(request), record(body).status));
  }

  @Get('tasks')
  @RequirePermission('admin:audit')
  listTasks(@Req() request: Request, @Query('agent') agent?: string, @Query('state') state?: string, @Query('limit') limit?: string) {
    if (state !== undefined && !TASK_STATES.includes(state as TaskState)) {
      throw new BadRequestException(`state must be one of ${TASK_STATES.join(', ')}`);
    }
    return this.tasks.listForAdmin(
      orgOf(request),
      { ...(agent ? { agentSlug: agent } : {}), ...(state ? { state: state as TaskState } : {}) },
      pageSize(limit),
    );
  }

  @Get('tasks/:id')
  @RequirePermission('admin:audit')
  async getTask(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    const task = await this.tasks.getForAdmin(id, orgOf(request));
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  @Get('outbound')
  @RequirePermission('admin:audit')
  listOutbound(@Req() request: Request, @Query('limit') limit?: string) {
    return this.outbound.list(orgOf(request), pageSize(limit));
  }
}

function orgOf(request: Request): string {
  const orgSlug = (request as Request & { organizationSlug?: string }).organizationSlug;
  if (!orgSlug) throw new BadRequestException('An authorized organization is required');
  return orgSlug;
}

function record(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Body must be an object');
  return body as Record<string, unknown>;
}

function pageSize(limit: string | undefined): number {
  if (limit === undefined) return 100;
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) throw new BadRequestException('limit must be a whole number from 1 to 500');
  return parsed;
}

/** An admin request the service turned down, as the HTTP error that says why. */
async function refused<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (!(error instanceof A2AAgentRefused)) throw error;
    if (error.reason === 'not-found') throw new NotFoundException(error.message);
    if (error.reason === 'exists') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
}

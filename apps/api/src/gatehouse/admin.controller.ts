import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { A2AAgentRefused, A2AAgentsService } from './a2a-agents.service';
import { DiscoveryMissing, GatehouseDiscoveryService } from './discovery.service';
import { AGENT_CREDENTIALS, ORDER_POLICIES, type AgentCredentialStore, type AgentGrant, type NewAgentGrant, type OrderPolicy } from './agent-credentials';
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
    @Inject(AGENT_CREDENTIALS) private readonly credentials: AgentCredentialStore,
    private readonly discovery: GatehouseDiscoveryService,
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

  /** The org's front door: the published A2A agent whose card is the company card. */
  @Get('front-door')
  @RequirePermission('agents:admin')
  async frontDoor(@Req() request: Request) {
    const org = await this.discovery.organization(concreteOrg(request));
    return { orgSlug: org.slug, frontDoor: org.frontDoor };
  }

  /** Choose the front door, or clear it. Body: {slug: <published A2A agent> | null}. */
  @Put('front-door')
  @RequirePermission('agents:admin')
  async setFrontDoor(@Req() request: Request, @Body() body: unknown) {
    const slug = record(body).slug;
    if (slug !== null && typeof slug !== 'string') throw new BadRequestException('slug must be an agent slug or null');
    try {
      const org = await this.discovery.setFrontDoor(concreteOrg(request), slug);
      return { orgSlug: org.slug, frontDoor: org.frontDoor };
    } catch (error) {
      if (error instanceof DiscoveryMissing) throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** The org's agent keys (never the keys themselves, only their prefixes). */
  @Get('keys')
  @RequirePermission('agents:admin')
  async listKeys(@Req() request: Request) {
    return (await this.credentials.list(orgOf(request))).map(keyView);
  }

  /**
   * Issue an agent key for one of the company's customer accounts. The key is
   * in this response only; it is never stored or shown again. Body: {agentName,
   * accountRef, accountLabel, orderPolicy?, perOrderLimitCents?,
   * monthlyLimitCents?, validDays?, orgSlug? (an admin of every org)}.
   */
  @Post('keys')
  @RequirePermission('agents:admin')
  async issueKey(@Req() request: Request, @Body() body: unknown, @CurrentUser() user: { id: string }) {
    const input = newKey(record(body), orgOf(request), user.id);
    const { grant, key } = await this.credentials.issue(input);
    return { grant: keyView(grant), key };
  }

  @Delete('keys/:id')
  @RequirePermission('agents:admin')
  async revokeKey(@Req() request: Request, @Param('id') id: string) {
    const grant = await this.credentials.revoke(id, orgOf(request));
    if (!grant) throw new NotFoundException(`No active agent key ${id} in this organization`);
    return keyView(grant);
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

/** One organization: the front door is per company, so an admin of every org picks one first. */
function concreteOrg(request: Request): string {
  const org = orgOf(request);
  if (org === '*') throw new BadRequestException('Choose an organization: the front door belongs to one');
  return org;
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

/** An agent key as the pages see it. */
function keyView(grant: AgentGrant) {
  const { id, orgSlug, agentName, accountRef, accountLabel, kind, tokenPrefix, orderPolicy, perOrderLimitCents, monthlyLimitCents } = grant;
  return {
    id, orgSlug, agentName, accountRef, accountLabel, kind, tokenPrefix, orderPolicy, perOrderLimitCents, monthlyLimitCents,
    rateLimitPerMinute: grant.rateLimitPerMinute,
    validUntil: grant.validUntil,
    revokedAt: grant.revokedAt,
    lastUsedAt: grant.lastUsedAt,
    createdBy: grant.createdBy,
    createdAt: grant.createdAt,
  };
}

/** A request to issue an agent key, checked; refuses anything unclear rather than guessing. */
export function newKey(body: Record<string, unknown>, org: string, userId: string): NewAgentGrant {
  const words = (field: string, max: number): string => {
    const value = body[field];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      throw new BadRequestException(`${field} is required (at most ${max} characters)`);
    }
    return value.trim();
  };
  const cents = (field: string): number | null => {
    const value = body[field];
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || (value as number) < 0) throw new BadRequestException(`${field} must be a whole number of cents, 0 or more`);
    return value as number;
  };
  const orgSlug = org === '*' ? body.orgSlug : org;
  if (typeof orgSlug !== 'string' || !orgSlug) throw new BadRequestException('orgSlug is required for an admin of every organization');
  const orderPolicy = (body.orderPolicy ?? 'approve_each') as OrderPolicy;
  if (!ORDER_POLICIES.includes(orderPolicy)) throw new BadRequestException(`orderPolicy must be one of ${ORDER_POLICIES.join(', ')}`);
  const perOrderLimitCents = cents('perOrderLimitCents');
  if (orderPolicy === 'auto_within_limits' && perOrderLimitCents === null) {
    throw new BadRequestException('auto_within_limits needs perOrderLimitCents: an agent may not order on its own without a limit');
  }
  const validDays = body.validDays;
  if (validDays !== undefined && validDays !== null && (!Number.isInteger(validDays) || (validDays as number) < 1 || (validDays as number) > 3650)) {
    throw new BadRequestException('validDays must be a whole number of days from 1 to 3650');
  }
  return {
    orgSlug,
    agentName: words('agentName', 80),
    accountRef: words('accountRef', 200),
    accountLabel: words('accountLabel', 200),
    orderPolicy,
    perOrderLimitCents,
    monthlyLimitCents: cents('monthlyLimitCents'),
    validUntil: typeof validDays === 'number' ? new Date(Date.now() + validDays * 86_400_000).toISOString() : null,
    createdBy: `admin:${userId}`,
  };
}

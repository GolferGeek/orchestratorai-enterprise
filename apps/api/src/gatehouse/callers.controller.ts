import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { CallerAuthService, GatehouseAuthError } from './caller-auth.service';
import { Caller, CallersRepository } from './callers.repository';
import { GatehouseKeysService } from './gatehouse-keys.service';
import { OutboundCallsRepository } from './outbound-calls.repository';
import { TasksRepository } from './tasks.repository';

/** The API's public base URL: tokens are addressed (aud) to URLs under it. */
export function gatehouseBaseUrl(config: ConfigProvider): string {
  return `${config.getRequired('PUBLIC_WEB_URL').replace(/\/$/, '')}/api`;
}

/** A caller as an admin sees it: never more than its public keys. */
function view(caller: Caller) {
  return {
    id: caller.id,
    name: caller.name,
    cardUrl: caller.cardUrl,
    jwksUrl: caller.jwksUrl,
    keyIds: (caller.jwks?.keys ?? []).map((key) => key.kid ?? null),
    status: caller.status,
    rateLimitPerMinute: caller.rateLimitPerMinute,
    registeredBy: caller.registeredBy,
    createdAt: caller.createdAt,
    lastSeenAt: caller.lastSeenAt,
  };
}

export function toHttpError(error: unknown): unknown {
  if (!(error instanceof GatehouseAuthError)) return error;
  switch (error.failure) {
    case 'unauthenticated':
      return new UnauthorizedException(error.message);
    case 'forbidden':
      return new ForbiddenException(error.message);
    case 'rate-limited':
      return new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
    case 'invalid-registration':
      return new BadRequestException(error.message);
  }
}

export function bearer(authorization: string | undefined): string {
  const token = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(authorization ?? '')?.[1];
  if (!token) throw new UnauthorizedException('Send a caller JWT or an agent key as Authorization: Bearer <token>');
  return token;
}

/**
 * Public: our JWK set (so partners can check our calls), and a caller's
 * self-registration (signed by the key it registers).
 */
@Controller('gatehouse')
export class GatehousePublicController {
  constructor(
    private readonly keys: GatehouseKeysService,
    private readonly auth: CallerAuthService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  @Get('jwks.json')
  jwks() {
    return this.keys.jwks();
  }

  @Post('callers/register')
  async register(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const { cardUrl, jwksUrl } = (body ?? {}) as Record<string, unknown>;
    if (typeof cardUrl !== 'string' || typeof jwksUrl !== 'string') {
      throw new BadRequestException('Body must be {cardUrl, jwksUrl}');
    }
    const audience = `${gatehouseBaseUrl(this.config)}/gatehouse/callers/register`;
    try {
      return view(await this.auth.registerSelf(bearer(authorization), audience, cardUrl, jwksUrl));
    } catch (error) {
      throw toHttpError(error);
    }
  }
}

/**
 * Callers are platform-wide (any org's published agent may name them), so
 * only an admin of every organization ('*') manages them.
 */
@Controller('gatehouse/callers')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class CallersAdminController {
  constructor(
    private readonly callers: CallersRepository,
    private readonly auth: CallerAuthService,
    private readonly tasks: TasksRepository,
    private readonly outbound: OutboundCallsRepository,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    requireAllOrgs(request);
    return (await this.callers.list()).map(view);
  }

  @Post()
  async register(@Req() request: Request, @Body() body: unknown, @CurrentUser() user: { id: string }) {
    requireAllOrgs(request);
    const { name, cardUrl, jwks } = (body ?? {}) as Record<string, unknown>;
    if (typeof name !== 'string' || typeof cardUrl !== 'string') {
      throw new BadRequestException('Body must be {name, cardUrl, jwks: {keys: [...]}}');
    }
    try {
      return view(await this.auth.registerByAdmin(name, cardUrl, jwks, user.id));
    } catch (error) {
      throw toHttpError(error);
    }
  }

  @Patch(':id')
  async setStatus(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    requireAllOrgs(request);
    const status = (body as { status?: unknown } | null)?.status;
    if (status !== 'active' && status !== 'suspended') throw new BadRequestException('status must be "active" or "suspended"');
    const caller = await this.callers.setStatus(id, status);
    if (!caller) throw new NotFoundException(`Caller ${id} not found`);
    return view(caller);
  }

  /**
   * Remove a caller that has never called or been answered. One with history
   * is suspended instead, so its tasks and replies keep naming it.
   */
  @Delete(':id')
  async remove(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string) {
    requireAllOrgs(request);
    if (!(await this.callers.byId(id))) throw new NotFoundException(`Caller ${id} not found`);
    if ((await this.tasks.anyForCaller(id)) || (await this.outbound.anyForCaller(id))) {
      throw new ConflictException('This caller has tasks or replies on record; suspend it instead');
    }
    await this.callers.delete(id);
    return { deleted: id };
  }
}

function requireAllOrgs(request: Request): void {
  if ((request as Request & { organizationSlug?: string }).organizationSlug !== '*') {
    throw new ForbiddenException('Managing callers needs admin access to every organization');
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacService } from '../rbac/rbac.service';
import { ORDER_POLICIES, type OrderPolicy } from './agent-credentials';
import { gatehouseBaseUrl } from './callers.controller';
import type { SignedInPerson } from './customer-accounts';
import { authorizationServerMetadata, GatehouseOAuthService, protectedResourceMetadata, type AuthorizeRequest, type Consent } from './oauth.service';

/** Not named Query: a type sharing the @Query() decorator's name makes Nest validate against the decorator. */
type QueryParams = Record<string, string | undefined>;

/** The query of an authorization request, as the consent page passes it back. */
function authorizeQuery(raw: unknown): QueryParams {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new BadRequestException('query must be the authorization request');
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === 'string') as Array<[string, string]>,
  );
}

/**
 * "Log in with <company>", the parts an app calls: discovery, registration,
 * the authorization request (which sends the person to our consent page) and
 * the token exchange. Public: the app is not signed in.
 */
@Controller('gatehouse/oauth')
export class GatehouseOAuthController {
  constructor(
    private readonly oauth: GatehouseOAuthService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  @Get('metadata')
  metadata() {
    return authorizationServerMetadata(gatehouseBaseUrl(this.config));
  }

  /** RFC 9728 for one published A2A agent: which authorization server issues its keys. */
  @Get('protected-resource/a2a/:slug')
  protectedA2A(@Param('slug') slug: string) {
    const base = gatehouseBaseUrl(this.config);
    return protectedResourceMetadata(base, `${base}/a2a/${slug}`, `A2A agent ${slug}`);
  }

  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.oauth.register(body);
    if (!result.ok) {
      response.status(400);
      return { error: result.error, error_description: result.error_description };
    }
    response.status(201);
    return result.client;
  }

  /** The person's browser lands here; the consent page in the web app checks and shows the request. */
  @Get('authorize')
  authorize(@Query() query: QueryParams, @Res() response: Response) {
    const web = this.config.getRequired('PUBLIC_WEB_URL').replace(/\/$/, '');
    const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    response.redirect(302, `${web}/connect?${params.toString()}`);
  }

  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async token(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.oauth.token(authorizeQuery(body ?? {}));
    if (!result.ok) {
      response.status(result.status);
      return { error: result.error, error_description: result.error_description };
    }
    return result.body;
  }
}

/**
 * The consent page's side: the person is signed in through the auth plane,
 * sees which app is asking, picks one of their customer accounts and the
 * ordering limits, and allows or declines.
 */
@Controller('gatehouse/oauth/consent')
@UseGuards(JwtAuthGuard)
export class GatehouseConsentController {
  constructor(
    private readonly oauth: GatehouseOAuthService,
    private readonly rbac: RbacService,
  ) {}

  /** The request as the page shows it: the app, the person's organizations, and their accounts in the chosen one. */
  @Get()
  async describe(@CurrentUser() user: CurrentUserLike, @Query() query: QueryParams) {
    const { org, ...request } = query;
    const checked = await this.oauth.check(request);
    if (!checked.ok) return 'show' in checked ? { show: checked.show } : { redirect: checked.redirect };
    const organizations = await this.organizationsOf(user.id);
    if (organizations.length === 0) return { show: 'Your account is not in any organization, so it cannot connect an agent.' };
    const orgSlug = org ?? organizations[0]!.slug;
    if (!organizations.some((o) => o.slug === orgSlug)) throw new ForbiddenException(`You are not in ${orgSlug}`);
    return {
      client: { name: checked.request.client.clientName, uri: checked.request.client.clientUri },
      organizations,
      orgSlug,
      accounts: await this.oauth.accountsFor(person(user), orgSlug),
    };
  }

  @Post('allow')
  @HttpCode(200)
  async allow(@CurrentUser() user: CurrentUserLike, @Body() body: unknown) {
    const b = record(body);
    const request = await this.request(b.query);
    if (!('client' in request)) return request;
    const consent = consentOf(b);
    if (!(await this.organizationsOf(user.id)).some((o) => o.slug === consent.orgSlug)) {
      throw new ForbiddenException(`You are not in ${consent.orgSlug}`);
    }
    try {
      return { redirect: await this.oauth.allow(request, person(user), consent) };
    } catch (error) {
      throw new ForbiddenException((error as Error).message);
    }
  }

  @Post('deny')
  @HttpCode(200)
  async deny(@Body() body: unknown) {
    const request = await this.request(record(body).query);
    if (!('client' in request)) return request;
    return { redirect: this.oauth.deny(request) };
  }

  private async request(raw: unknown): Promise<AuthorizeRequest | { show: string } | { redirect: string }> {
    const checked = await this.oauth.check(authorizeQuery(raw));
    if (checked.ok) return checked.request;
    return 'show' in checked ? { show: checked.show } : { redirect: checked.redirect };
  }

  /** Concrete organizations only: an admin of every organization still picks one. */
  private async organizationsOf(userId: string) {
    return (await this.rbac.getUserOrganizations(userId))
      .filter((o) => o.organizationSlug !== '*')
      .map((o) => ({ slug: o.organizationSlug, name: o.organizationName }));
  }
}

interface CurrentUserLike {
  id: string;
  email?: string;
  userMetadata?: Record<string, unknown>;
}

function person(user: CurrentUserLike): SignedInPerson {
  const meta = user.userMetadata ?? {};
  const name = [meta.display_name, meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return { userId: user.id, email: user.email ?? null, displayName: name ?? null };
}

function record(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Body must be an object');
  return body as Record<string, unknown>;
}

/** What the person chose, checked; anything unclear is refused rather than guessed. */
export function consentOf(b: Record<string, unknown>): Consent {
  const text = (field: string, max: number, required: boolean): string | null => {
    const value = b[field];
    if (value === undefined || value === null || value === '') {
      if (required) throw new BadRequestException(`${field} is required`);
      return null;
    }
    if (typeof value !== 'string' || value.trim().length > max) throw new BadRequestException(`${field} must be text of at most ${max} characters`);
    return value.trim();
  };
  const cents = (field: string): number | null => {
    const value = b[field];
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || (value as number) < 0) throw new BadRequestException(`${field} must be a whole number of cents, 0 or more`);
    return value as number;
  };
  const orderPolicy = (b.orderPolicy ?? 'approve_each') as OrderPolicy;
  if (!ORDER_POLICIES.includes(orderPolicy)) throw new BadRequestException(`orderPolicy must be one of ${ORDER_POLICIES.join(', ')}`);
  const perOrderLimitCents = cents('perOrderLimitCents');
  if (orderPolicy === 'auto_within_limits' && perOrderLimitCents === null) {
    throw new BadRequestException('auto_within_limits needs perOrderLimitCents: an agent may not order on its own without a limit');
  }
  const validDays = b.validDays;
  if (validDays !== undefined && validDays !== null && (!Number.isInteger(validDays) || (validDays as number) < 1 || (validDays as number) > 3650)) {
    throw new BadRequestException('validDays must be a whole number of days from 1 to 3650');
  }
  return {
    orgSlug: text('orgSlug', 100, true)!,
    accountRef: text('accountRef', 200, true)!,
    agentName: text('agentName', 80, false),
    orderPolicy,
    perOrderLimitCents,
    monthlyLimitCents: cents('monthlyLimitCents'),
    validUntil: typeof validDays === 'number' ? new Date(Date.now() + validDays * 86_400_000).toISOString() : null,
  };
}

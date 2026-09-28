import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Res,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { A2A_ERRORS, A2ARpcError, rpcError } from './a2a-inbound';
import { A2A_VERSION } from './a2a-v1';
import { CallerAuthService } from './caller-auth.service';
import { bearer, gatehouseBaseUrl, toHttpError } from './callers.controller';
import { GatehouseInboundService } from './inbound.service';

type RpcId = string | number | null;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Each published A2A agent (an active a2a agent of one org) is an A2A v1.0
 * agent at /a2a/<slug>: its card, and a JSON-RPC endpoint that only
 * registered callers may use.
 */
@Controller('a2a')
export class GatehouseInboundController {
  private readonly logger = new Logger(GatehouseInboundController.name);

  constructor(
    private readonly agents: AgentDefinitionService,
    private readonly auth: CallerAuthService,
    private readonly inbound: GatehouseInboundService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  /** The card, cacheable for five minutes, with an ETag and the agent's Last-Modified. */
  @Get(':slug/.well-known/agent-card.json')
  async card(@Param('slug') slug: string, @Headers('if-none-match') ifNoneMatch: string | undefined, @Res() response: Response) {
    const agent = await this.published(slug);
    const body = JSON.stringify(agentCard(agent, gatehouseBaseUrl(this.config)));
    const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.setHeader('ETag', etag);
    response.setHeader('Last-Modified', new Date(agent.updatedAt).toUTCString());
    if (ifNoneMatch === etag) {
      response.status(304).end();
      return;
    }
    response.status(200).type('application/json').send(body);
  }

  @Post(':slug')
  @HttpCode(200)
  async rpc(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('a2a-version') version: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
  ) {
    if (!/^application\/json\b/i.test(contentType ?? '')) {
      return rpcError(null, A2A_ERRORS.contentTypeNotSupported, 'Send the request as application/json');
    }
    const request = (body ?? {}) as Record<string, unknown>;
    const id: RpcId = typeof request.id === 'string' || typeof request.id === 'number' ? request.id : null;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || id === null) {
      return rpcError(id, A2A_ERRORS.invalidRequest, 'Send a JSON-RPC 2.0 request with an id and a method');
    }
    if (!/^1\.0(\.\d+)?$/.test(version ?? '')) {
      return rpcError(id, A2A_ERRORS.versionNotSupported, `This agent speaks A2A ${A2A_VERSION} only; send the header A2A-Version: ${A2A_VERSION}`);
    }

    const agent = await this.published(slug);
    const endpoint = `${gatehouseBaseUrl(this.config)}/a2a/${slug}`;
    let caller;
    try {
      caller = await this.auth.verify(bearer(authorization), endpoint);
    } catch (error) {
      throw toHttpError(error);
    }
    const policy = agent.a2a!.callers;
    if (policy !== 'any' && !policy.allow.includes(caller.cardUrl)) {
      throw new ForbiddenException('This agent does not take calls from this caller');
    }

    try {
      return { jsonrpc: '2.0', id, result: await this.inbound.handle(request.method, request.params, agent, caller) };
    } catch (error) {
      if (error instanceof A2ARpcError) return rpcError(id, error.code, error.message);
      this.logger.error(`A2A ${request.method} on ${slug} from ${caller.name} failed: ${(error as Error).message}`);
      return rpcError(id, A2A_ERRORS.internalError, 'Internal error');
    }
  }

  private async published(slug: string): Promise<AgentDefinition> {
    const agent = SLUG.test(slug) ? await this.agents.resolvePublishedA2A(slug) : null;
    if (!agent) throw new NotFoundException(`No A2A agent ${slug}`);
    return agent;
  }
}

/** An A2A v1.0 AgentCard for one published agent: one skill, the agent itself. */
export function agentCard(agent: AgentDefinition, base: string) {
  const register = `${base}/gatehouse/callers/register`;
  return {
    name: agent.name,
    description: agent.description ?? agent.name,
    version: agent.version,
    provider: { organization: 'OrchestratorAI', url: base.replace(/\/api$/, '') },
    supportedInterfaces: [{ url: `${base}/a2a/${agent.slug}`, protocolBinding: 'JSONRPC', protocolVersion: A2A_VERSION }],
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    securitySchemes: {
      callerJwt: {
        httpAuthSecurityScheme: {
          scheme: 'Bearer',
          bearerFormat: 'JWT',
          description:
            `A JWT signed with your registered key: iss = your agent card URL, aud = this interface URL, ` +
            `a unique jti, and a lifetime of at most 5 minutes. Register at ${register} ` +
            `(your card and JWK set on one https origin, the request signed by that key).`,
        },
      },
    },
    securityRequirements: [{ schemes: { callerJwt: { list: [] } } }],
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: agent.slug,
        name: agent.name,
        description: agent.description ?? agent.name,
        tags: ['a2a', agent.a2a!.target.kind],
      },
    ],
  };
}

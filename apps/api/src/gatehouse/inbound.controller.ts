import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Res,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { A2A_ERRORS, A2ARpcError, rpcError } from './a2a-inbound';
import { A2A_VERSION } from './a2a-v1';
import { GatehouseSignInService } from './gatehouse-sign-in.service';
import { principalName, type Principal } from './principal';
import { OAUTH_SCOPE } from './oauth.service';
import { bearer, gatehouseBaseUrl, toHttpError } from './callers.controller';
import { GatehouseInboundService, type TaskStream } from './inbound.service';

type RpcId = string | number | null;
const STREAMING_METHODS = new Set(['SendStreamingMessage', 'SubscribeToTask']);
const HEARTBEAT_MS = 15_000;

/** A streaming call that passed every check: its JSON-RPC id and the stream to serve. */
export class OpenStream {
  constructor(readonly id: string | number, readonly stream: TaskStream) {}
}
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
    private readonly signIn: GatehouseSignInService,
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

  /**
   * JSON-RPC over HTTP. SendStreamingMessage and SubscribeToTask answer with
   * Server-Sent Events: each `data:` line is a JSON-RPC response with the
   * request's id and one StreamResponse as its result. The stream closes when
   * the task ends or the caller disconnects.
   */
  @Post(':slug')
  @HttpCode(200)
  async endpoint(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('a2a-version') version: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const outcome = await this.rpc(slug, authorization, version, contentType, body);
    if (!(outcome instanceof OpenStream)) {
      response.status(200).json(outcome);
      return;
    }
    const { id, stream } = outcome;
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-store');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const send = (result: Record<string, unknown>) => {
      if (!response.writableEnded) response.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(': heartbeat\n\n');
    }, HEARTBEAT_MS);
    const closed = new Promise<void>((resolve) => request.on('close', () => resolve()));
    send(stream.first);
    try {
      await stream.follow(send, closed);
    } catch (error) {
      this.logger.error(`A2A stream on ${slug} failed: ${(error as Error).message}`);
    } finally {
      clearInterval(heartbeat);
      if (!response.writableEnded) response.end();
    }
  }

  /** Everything before the response is written: checks, then the method's JSON result or an open stream. */
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
    let caller: Principal;
    try {
      caller = await this.who(bearer(authorization), agent, endpoint);
    } catch (error) {
      throw toHttpError(error);
    }

    try {
      if (STREAMING_METHODS.has(request.method)) {
        const method = request.method as 'SendStreamingMessage' | 'SubscribeToTask';
        return new OpenStream(id, await this.inbound.openStream(method, request.params, agent, caller));
      }
      return { jsonrpc: '2.0', id, result: await this.inbound.handle(request.method, request.params, agent, caller) };
    } catch (error) {
      if (error instanceof A2ARpcError) return rpcError(id, error.code, error.message);
      this.logger.error(`A2A ${request.method} on ${slug} from ${principalName(caller)} failed: ${(error as Error).message}`);
      return rpcError(id, A2A_ERRORS.internalError, 'Internal error');
    }
  }

  /** Who is calling, and whether they may call this agent (shared with the MCP endpoint). */
  private async who(token: string, agent: AgentDefinition, endpoint: string): Promise<Principal> {
    const principal = await this.signIn.signIn(token, endpoint, agent.orgSlug!);
    this.signIn.mayCall(principal, agent);
    return principal;
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
    // Tasks that follow a workflow run can be streamed; the others answer at once.
    capabilities: { streaming: GatehouseInboundService.streams(agent), pushNotifications: false, extendedAgentCard: false },
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
      oauth: {
        oauth2SecurityScheme: {
          description:
            `"Log in with" the company: the person signs in, picks their customer account and its ordering limits, ` +
            `and your agent gets an agent key (send it as Bearer, like agentKey).`,
          flows: {
            authorizationCode: {
              authorizationUrl: `${base}/gatehouse/oauth/authorize`,
              tokenUrl: `${base}/gatehouse/oauth/token`,
              refreshUrl: `${base}/gatehouse/oauth/token`,
              scopes: { [OAUTH_SCOPE]: 'Act for one customer account, within its ordering limits' },
              pkceRequired: true,
            },
          },
          oauth2MetadataUrl: `${base}/gatehouse/oauth/metadata`,
        },
      },
      agentKey: {
        httpAuthSecurityScheme: {
          scheme: 'Bearer',
          description:
            `An agent key the company issued to your agent for one of its customer accounts, sent as is. ` +
            `It carries that account's ordering limits and can be revoked at any time.`,
        },
      },
    },
    // Either one: a registered agent's signed JWT, or an agent key issued for one of the company's customer accounts.
    securityRequirements: [
      { schemes: { callerJwt: { list: [] } } },
      { schemes: { agentKey: { list: [] } } },
      { schemes: { oauth: { list: [OAUTH_SCOPE] } } },
    ],
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

import { All, Body, Controller, Headers, HttpStatus, Inject, Logger, Param, Post, Req, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { A2ARpcError } from './a2a-inbound';
import type { A2APart } from './a2a-v1';
import { GatehouseAuthError } from './caller-auth.service';
import { gatehouseBaseUrl } from './callers.controller';
import { GatehouseSignInService } from './gatehouse-sign-in.service';
import { GatehouseInboundService } from './inbound.service';
import { OAUTH_SCOPE } from './oauth.service';
import { principalName, type Principal } from './principal';

const ORG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A task as the A2A side answers it (wireTask). */
interface WireTask {
  id: string;
  status: { state: string; message?: { parts?: A2APart[] } };
  artifacts?: Array<{ parts: A2APart[] }>;
}

/**
 * The company's MCP endpoint (Streamable HTTP, stateless): POST /mcp/<org>.
 * ChatGPT, Claude, Codex and any MCP client call the org's published A2A
 * agents as tools, each with the same route (ambient, agent, workflow or
 * another A2A agent), sign-in, limits, tasks and Jev rules as over A2A. One
 * more tool, get_task, follows work that takes a while.
 *
 * Without a key it answers 401 with a pointer to "Log in with <company>"
 * (RFC 9728), which is how an MCP client starts OAuth.
 */
@Controller('mcp')
export class GatehouseMcpController {
  private readonly logger = new Logger(GatehouseMcpController.name);

  constructor(
    private readonly agents: AgentDefinitionService,
    private readonly signIn: GatehouseSignInService,
    private readonly inbound: GatehouseInboundService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  @Post(':org')
  async post(
    @Param('org') org: string,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    if (!ORG.test(org)) {
      response.status(HttpStatus.NOT_FOUND).json({ error: `No MCP endpoint for ${org}` });
      return;
    }
    const base = gatehouseBaseUrl(this.config);
    const endpoint = `${base}/mcp/${org}`;
    const challenge = (error?: string) =>
      `Bearer resource_metadata="${base.replace(/\/api$/, '')}/.well-known/oauth-protected-resource/api/mcp/${org}"` +
      `${error ? `, error="${error}"` : ''}, scope="${OAUTH_SCOPE}"`;

    const token = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(authorization ?? '')?.[1];
    if (!token) {
      response.status(HttpStatus.UNAUTHORIZED).setHeader('WWW-Authenticate', challenge()).json({
        error: 'Connect first: log in with the company (OAuth), or send an agent key as Authorization: Bearer <key>.',
      });
      return;
    }
    let principal: Principal;
    try {
      principal = await this.signIn.signIn(token, endpoint, org);
    } catch (error) {
      if (!(error instanceof GatehouseAuthError)) throw error;
      const status =
        error.failure === 'forbidden' ? HttpStatus.FORBIDDEN : error.failure === 'rate-limited' ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.UNAUTHORIZED;
      if (status === HttpStatus.UNAUTHORIZED) response.setHeader('WWW-Authenticate', challenge('invalid_token'));
      response.status(status).json({ error: error.message });
      return;
    }

    const server = this.serverFor(org, principal, await this.publishedAgents(org));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  /** Stateless: no server-sent stream and no sessions to end. */
  @All(':org')
  other(@Res() response: Response): void {
    response.status(HttpStatus.METHOD_NOT_ALLOWED).setHeader('Allow', 'POST').json({ error: 'This MCP endpoint takes POST only (stateless Streamable HTTP).' });
  }

  /** The org's published A2A agents: an active a2a agent of exactly this org. */
  private async publishedAgents(org: string): Promise<AgentDefinition[]> {
    return (await this.agents.listAgents(org)).filter((agent) => agent.agentType === 'a2a' && agent.orgSlug === org);
  }

  /**
   * The org's tools, listed with plain JSON Schemas: one per published agent
   * (the set changes as agents are published), plus get_task.
   */
  private serverFor(org: string, principal: Principal, agents: AgentDefinition[]): Server {
    const server = new Server({ name: `${org} (OrchestratorAI Gatehouse)`, version: '1.0.0' }, { capabilities: { tools: {} } });
    const bySlug = new Map(agents.map((agent) => [agent.slug, agent]));
    const tools: Tool[] = agents.map((agent) => ({
      name: agent.slug,
      title: agent.name,
      description:
        `${agent.description ?? agent.name}` +
        (agent.a2a!.target.kind === 'workflow' || agent.a2a!.target.kind === 'ambient'
          ? ' Starts work that may take a while: the answer says how to follow it with get_task.'
          : ''),
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', minLength: 1, description: 'What you ask, in plain words.' },
          data: { type: 'object', description: 'Structured fields, when the agent takes them.' },
        },
        required: ['message'],
        additionalProperties: false,
      },
    }));
    if (agents.length > 0) {
      tools.push({
        name: 'get_task',
        title: 'Follow a task',
        description: 'Where a task one of the other tools started stands, and its answer once it is done.',
        inputSchema: {
          type: 'object',
          properties: {
            agent: { type: 'string', enum: agents.map((a) => a.slug), description: 'The tool that started the task.' },
            task_id: { type: 'string', format: 'uuid', description: 'The task id that tool answered with.' },
          },
          required: ['agent', 'task_id'],
          additionalProperties: false,
        },
      });
    }

    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (params.name === 'get_task' && agents.length > 0) {
        const agent = typeof args.agent === 'string' ? bySlug.get(args.agent) : undefined;
        if (!agent) return refused('agent must be one of the tools that starts tasks');
        if (typeof args.task_id !== 'string' || !UUID.test(args.task_id)) return refused('task_id must be the task id a tool answered with');
        return this.run(principal, agent, 'GetTask', { id: args.task_id });
      }
      const agent = bySlug.get(params.name);
      if (!agent) return refused(`No tool ${params.name}`);
      if (typeof args.message !== 'string' || !args.message.trim()) return refused('message is required');
      const data = args.data;
      if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) return refused('data must be an object');
      return this.run(principal, agent, 'SendMessage', {
        message: {
          messageId: randomUUID(),
          role: 'ROLE_USER',
          parts: [{ text: args.message }, ...(data === undefined ? [] : [{ data, mediaType: 'application/json' }])],
        },
      });
    });
    return server;
  }

  /** One A2A method on one agent, as an MCP tool result. */
  private async run(principal: Principal, agent: AgentDefinition, method: 'SendMessage' | 'GetTask', params: unknown): Promise<CallToolResult> {
    try {
      this.signIn.mayCall(principal, agent);
      const answer = (await this.inbound.handle(method, params, agent, principal)) as { task?: WireTask } & WireTask;
      return toolResult(agent.slug, method === 'SendMessage' ? answer.task! : answer);
    } catch (error) {
      if (error instanceof A2ARpcError || error instanceof GatehouseAuthError) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
      this.logger.error(`MCP ${method} on ${agent.slug} from ${principalName(principal)} failed: ${(error as Error).message}`);
      return { isError: true, content: [{ type: 'text', text: 'Internal error' }] };
    }
  }
}

const STATES: Record<string, string> = {
  TASK_STATE_SUBMITTED: 'submitted',
  TASK_STATE_WORKING: 'working',
  TASK_STATE_COMPLETED: 'completed',
  TASK_STATE_FAILED: 'failed',
  TASK_STATE_CANCELED: 'canceled',
  TASK_STATE_REJECTED: 'rejected',
};

/** An A2A task as an MCP tool result: the answer when it is done, how to follow it when not, the reason when it failed. */
export function toolResult(agentSlug: string, task: WireTask): CallToolResult {
  const state = STATES[task.status.state];
  if (!state) throw new Error(`Task ${task.id} has an unknown state ${task.status.state}`);
  const said = (task.status.message?.parts ?? []).flatMap((part) => ('text' in part ? [part.text] : [])).join(' ');
  const structured = { taskId: task.id, state };

  if (state === 'completed') {
    const parts = (task.artifacts ?? []).flatMap((artifact) => artifact.parts);
    return {
      content: parts.map((part) =>
        'text' in part
          ? { type: 'text' as const, text: part.text }
          : 'url' in part
            ? { type: 'resource_link' as const, uri: part.url, name: part.filename ?? part.url, ...(part.mediaType ? { mimeType: part.mediaType } : {}) }
            : { type: 'text' as const, text: JSON.stringify(part.data) },
      ),
      structuredContent: structured,
    };
  }
  if (state === 'submitted' || state === 'working') {
    return {
      content: [{ type: 'text', text: `Working on it${said ? ` (${said})` : ''}. Follow it with get_task: agent "${agentSlug}", task_id "${task.id}".` }],
      structuredContent: structured,
    };
  }
  return { isError: true, content: [{ type: 'text', text: said || `The task ${state}.` }], structuredContent: structured };
}

function refused(why: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: why }] };
}

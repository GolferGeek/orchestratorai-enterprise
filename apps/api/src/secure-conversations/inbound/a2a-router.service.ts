import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ExecutionContext,
  InvokeData,
} from '@orchestrator-ai/transport-types';
import { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';
import { createExternalOriginContext } from './external-origin-context';

export interface InternalRouteTarget {
  product: 'workflows' | 'agents' | 'ambient';
  agentSlug: string;
  agentType: string;
}

@Injectable()
export class A2ARouterService {
  private readonly logger = new Logger(A2ARouterService.name);
  private readonly defaultOrgSlug: string;

  constructor(
    private readonly config: ConfigService,
    private readonly invokeDispatch: InvokeDispatchService,
  ) {
    this.defaultOrgSlug = this.config.get<string>('DEFAULT_ORG_SLUG', 'default');
  }

  resolveRoute(
    method: string,
    params?: Record<string, unknown>,
    _agentId?: string,
  ): InternalRouteTarget {
    if (method.startsWith('ambient.')) {
      this.logger.log(`Routing ${method} to Ambient module`);
      return {
        product: 'ambient',
        agentSlug: this.resolveAgentSlug(params, 'ambient'),
        agentType: 'automation',
      };
    }

    if (method.startsWith('workflows.')) {
      this.logger.log(`Routing ${method} to Workflows module`);
      return {
        product: 'workflows',
        agentSlug: this.resolveAgentSlug(params, 'marketing-swarm'),
        agentType: 'workflow',
      };
    }

    if (method.startsWith('agents.')) {
      this.logger.log(`Routing ${method} to Agents module`);
      return {
        product: 'agents',
        agentSlug: this.resolveAgentSlug(params, 'contract-assistant'),
        agentType: 'context',
      };
    }

    const forgeSkills = [
      'langgraph',
      'workflow',
      'multi-agent',
      'orchestration',
      'plan',
      'plan.create',
      'plan.execute',
    ];

    const skillName = (params?.skill as string) ?? method;
    if (forgeSkills.some((skill) => skillName.includes(skill))) {
      this.logger.log(`Routing ${method} (skill: ${skillName}) to Workflows module`);
      return {
        product: 'workflows',
        agentSlug: this.resolveAgentSlug(params, 'marketing-swarm'),
        agentType: 'workflow',
      };
    }

    this.logger.log(`Routing ${method} to Agents module (default)`);
    return {
      product: 'agents',
      agentSlug: this.resolveAgentSlug(params, 'contract-assistant'),
      agentType: 'context',
    };
  }

  async forwardRequest(
    target: InternalRouteTarget,
    jsonRpcRequest: unknown,
    agentId?: string,
  ): Promise<unknown> {
    const request = jsonRpcRequest as {
      id?: string | number;
      method: string;
      params?: Record<string, unknown>;
    };

    const enrichedParams = this.ensureExecutionContext(
      request.params ?? {},
      target,
      agentId,
    );
    const context = enrichedParams.context;
    const data = this.toInvokeData(enrichedParams);

    this.logger.log(`Forwarding ${request.method} to unified ${target.product} dispatcher`);

    const output = await this.invokeDispatch.invoke(context, data, {
      sourceProtocol: 'a2a-jsonrpc',
      sourceModule: 'secure-conversations',
      originalMethod: request.method,
      externalAgentId: agentId,
      targetProduct: target.product,
    });

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { success: true, output, context },
    };
  }

  private ensureExecutionContext(
    params: Record<string, unknown>,
    target: InternalRouteTarget,
    agentId?: string,
  ): Record<string, unknown> & { context: ExecutionContext } {
    if (params.context && typeof params.context === 'object') {
      return params as Record<string, unknown> & { context: ExecutionContext };
    }

    const context = createExternalOriginContext({
      orgSlug: this.defaultOrgSlug,
      agentId,
      agentSlug: target.agentSlug,
      agentType: target.agentType,
    });

    this.logger.debug(
      `Injected external ExecutionContext for agent ${agentId ?? 'unknown'} (conversationId=${context.conversationId})`,
    );

    return { ...params, context };
  }

  private resolveAgentSlug(params: Record<string, unknown> | undefined, defaultSlug: string): string {
    const explicit = params?.agentSlug ?? params?.targetAgentSlug;
    if (typeof explicit === 'string' && explicit.trim().length > 0) {
      return explicit;
    }
    return defaultSlug;
  }

  private toInvokeData(params: Record<string, unknown>): InvokeData {
    const data = params.data;
    if (data && typeof data === 'object' && 'content' in data) {
      return data as InvokeData;
    }

    return {
      content: params.content ?? params,
      contentType: typeof params.content === 'string' ? 'text' : 'json',
    };
  }
}

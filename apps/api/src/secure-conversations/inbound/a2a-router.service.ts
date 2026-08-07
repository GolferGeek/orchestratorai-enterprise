import { Injectable, Logger } from '@nestjs/common';
import type { InvokeData } from '@orchestrator-ai/transport-types';
import { isExecutionContext } from '@orchestrator-ai/transport-types';
import { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';

export interface InternalRouteTarget {
  product: 'workflows' | 'agents' | 'ambient';
  agentSlug: string;
  agentType: string;
}

@Injectable()
export class A2ARouterService {
  private readonly logger = new Logger(A2ARouterService.name);

  constructor(
    private readonly invokeDispatch: InvokeDispatchService,
  ) {}

  resolveRoute(
    method: string,
    params?: { context?: unknown },
    _agentId?: string,
  ): InternalRouteTarget {
    if (method !== 'invoke') {
      throw new Error('Secure Conversations only routes the invoke method');
    }
    const context = params?.context;
    if (!isExecutionContext(context)) {
      throw new Error('A complete ExecutionContext is required for A2A routing');
    }
    const product = this.resolveProduct(context.agentType);
    this.logger.log(
      `Routing invoke for ${context.agentSlug} to ${product} module`,
    );
    return {
      product,
      agentSlug: context.agentSlug,
      agentType: context.agentType,
    };
  }

  async forwardRequest(
    target: InternalRouteTarget,
    jsonRpcRequest: unknown,
    agentId: string | undefined,
    organizationSlug: string,
  ): Promise<unknown> {
    const request = jsonRpcRequest as {
      id?: string | number;
      method: string;
      params?: Record<string, unknown>;
    };

    if (!request.params || typeof request.params !== 'object') {
      throw new Error('A2A invoke params are required');
    }
    const context = request.params.context;
    if (
      !isExecutionContext(context) ||
      context.orgSlug !== this.requireOrganizationSlug(organizationSlug) ||
      context.agentSlug !== target.agentSlug ||
      context.agentType !== target.agentType
    ) {
      throw new Error('A2A invoke context does not match the routed target');
    }
    const data = this.toInvokeData(request.params);

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

  private requireOrganizationSlug(organizationSlug: string): string {
    if (!organizationSlug || organizationSlug === '*') {
      throw new Error(
        'A concrete authenticated organization is required for A2A routing',
      );
    }
    return organizationSlug;
  }

  private resolveProduct(
    agentType: string,
  ): InternalRouteTarget['product'] {
    if (agentType === 'workflow') return 'workflows';
    if (agentType === 'automation' || agentType === 'ambient') return 'ambient';
    return 'agents';
  }

  private toInvokeData(params: Record<string, unknown>): InvokeData {
    const data = params.data;
    if (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Object.prototype.hasOwnProperty.call(data, 'content')
    ) {
      return data as InvokeData;
    }
    throw new Error('A2A invoke data.content is required');
  }
}

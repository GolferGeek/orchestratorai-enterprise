/**
 * External Family Runner
 *
 * Handles agents of family type 'external':
 * - Calls an external agent via A2A (invoke) protocol
 * - Forwards ExecutionContext to the external agent unchanged
 * - Handles A2A invoke response format
 * - Returns InvokeOutput from the external agent's response
 *
 * Config fields used from AgentDefinitionV2:
 *   endpoint     — the remote agent's /invoke endpoint URL
 *   authConfig   — authentication config for the remote endpoint
 *   externalCard — optional A2A capability card describing the remote agent
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
  A2AInvokeSuccessResponse,
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import type { FamilyRunner } from '../invoke-dispatch.service';
import type { AgentDefinitionV2 } from '../agent-definition.types';

@Injectable()
export class ExternalFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(ExternalFamilyRunner.name);

  constructor(@Inject(HttpService) private readonly httpService: HttpService) {}

  async invoke(
    definition: AgentDefinitionV2,
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    this.logger.debug(
      `ExternalFamilyRunner.invoke — agent: ${definition.slug}, endpoint: ${definition.endpoint}`,
    );

    const endpoint = definition.endpoint;
    if (!endpoint) {
      throw new Error(
        `External agent ${definition.slug} missing endpoint in definition`,
      );
    }

    const headers = this.buildHeaders(definition);

    // Build A2A invoke request — context flows through unchanged
    const a2aRequest = {
      jsonrpc: '2.0' as const,
      id: `${definition.slug}-${Date.now()}`,
      method: 'invoke' as const,
      params: {
        context,
        data,
        metadata: {
          ...metadata,
          forwardedBy: 'compose',
          forwardingAgent: definition.slug,
        },
      },
    };

    let rawResponse: unknown;
    try {
      const observable = this.httpService.request({
        url: endpoint,
        method: 'POST',
        headers,
        data: a2aRequest,
        timeout: 60_000,
        validateStatus: () => true,
      });

      const response = await firstValueFrom(observable);

      if (response.status !== 200) {
        throw new Error(
          `External agent returned HTTP ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }
      rawResponse = response.data;
    } catch (err) {
      this.logger.error(
        `External agent ${definition.slug} call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    return this.parseA2AResponse(rawResponse, definition.slug);
  }

  private buildHeaders(definition: AgentDefinitionV2): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'OrchestratorAI-Compose/1.0',
    };

    const auth = definition.authConfig;
    if (!auth) {
      return headers;
    }

    const authType = auth.type as string | undefined;
    const token = auth.token as string | undefined;
    const header = (auth.header as string | undefined) ?? 'Authorization';

    if (authType === 'bearer' && token) {
      headers[header] = `Bearer ${token}`;
    } else if (authType === 'apikey' && token) {
      headers[header] = token;
    }

    return headers;
  }

  private parseA2AResponse(
    rawResponse: unknown,
    agentSlug: string,
  ): InvokeOutput {
    if (!rawResponse || typeof rawResponse !== 'object') {
      throw new Error(
        `External agent ${agentSlug} returned invalid response format`,
      );
    }

    const response = rawResponse as Record<string, unknown>;

    // Handle JSON-RPC error
    if (response.error) {
      const err = response.error as Record<string, unknown>;
      const errMessage =
        typeof err.message === 'string' ? err.message : 'Unknown error';
      const errCode =
        typeof err.code === 'number'
          ? err.code
          : JsonRpcErrorCode.INTERNAL_ERROR;
      throw new Error(
        `External agent error: ${errMessage} (code: ${String(errCode)})`,
      );
    }

    // Expect JSON-RPC success response
    if (!response.result || typeof response.result !== 'object') {
      throw new Error(
        `External agent ${agentSlug} response missing result field`,
      );
    }

    const result = response.result as Record<string, unknown>;

    if (!result.success) {
      throw new Error(`External agent ${agentSlug} reported failure in result`);
    }

    const output = result.output as
      | A2AInvokeSuccessResponse['result']['output']
      | undefined;
    if (!output) {
      throw new Error(
        `External agent ${agentSlug} result missing output field`,
      );
    }

    return {
      content: output.content,
      outputType: output.outputType,
      metadata: {
        ...((output.metadata as Record<string, unknown>) ?? {}),
        forwardedFrom: agentSlug,
      },
    };
  }
}

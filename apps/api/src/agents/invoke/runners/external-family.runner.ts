/**
 * External Family Runner
 *
 * Handles agents of family type 'external':
 * - Calls an external agent via A2A (invoke) protocol
 * - Forwards ExecutionContext to the external agent unchanged
 * - Handles A2A invoke response format
 * - Returns InvokeOutput from the external agent's response
 *
 * Config fields used from AgentDefinition:
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
import type { AgentDefinition } from '../agent-definition.types';
import { OutboundUrlValidatorService } from '../../../secure-conversations/security/outbound-url-validator.service';
import { buildOutboundHeaders } from './outbound-auth-headers';
import { randomUUID } from 'node:crypto';

const MAXIMUM_A2A_RESPONSE_BYTES = 1_048_576;
const OUTPUT_TYPES = new Set([
  'text',
  'markdown',
  'json',
  'image',
  'video',
  'audio',
  'artifact-ref',
]);

@Injectable()
export class ExternalFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(ExternalFamilyRunner.name);

  constructor(
    @Inject(HttpService) private readonly httpService: HttpService,
    private readonly outboundUrls: OutboundUrlValidatorService,
  ) {}

  async invoke(
    definition: AgentDefinition,
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

    const safeEndpoint = await this.outboundUrls.assertSafe(endpoint);
    const headers = buildOutboundHeaders(definition);
    const requestId = `${definition.slug}-${randomUUID()}`;

    // Build A2A invoke request — context flows through unchanged
    const a2aRequest = {
      jsonrpc: '2.0' as const,
      id: requestId,
      method: 'invoke' as const,
      params: {
        context,
        data,
        metadata: {
          ...metadata,
          forwardedBy: 'agents',
          forwardingAgent: definition.slug,
        },
      },
    };

    let rawResponse: unknown;
    try {
      const observable = this.httpService.request({
        url: safeEndpoint.toString(),
        method: 'POST',
        headers,
        data: a2aRequest,
        timeout: 60_000,
        maxRedirects: 0,
        maxContentLength: MAXIMUM_A2A_RESPONSE_BYTES,
        maxBodyLength: MAXIMUM_A2A_RESPONSE_BYTES,
        validateStatus: () => true,
      });

      const response = await firstValueFrom(observable);

      if (response.status !== 200) {
        throw new Error(
          `External agent returned HTTP ${response.status}`,
        );
      }
      rawResponse = response.data;
    } catch (err) {
      this.logger.error(
        `External agent ${definition.slug} call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    return this.parseA2AResponse(rawResponse, definition.slug, requestId);
  }

  private parseA2AResponse(
    rawResponse: unknown,
    agentSlug: string,
    requestId: string,
  ): InvokeOutput {
    if (!rawResponse || typeof rawResponse !== 'object') {
      throw new Error(
        `External agent ${agentSlug} returned invalid response format`,
      );
    }

    const response = rawResponse as Record<string, unknown>;

    if (response.jsonrpc !== '2.0') {
      throw new Error(`External agent ${agentSlug} returned invalid JSON-RPC`);
    }
    if (response.id !== requestId) {
      throw new Error(`External agent ${agentSlug} response id does not match`);
    }
    if (Boolean(response.result) === Boolean(response.error)) {
      throw new Error(
        `External agent ${agentSlug} returned an ambiguous JSON-RPC response`,
      );
    }

    // Handle JSON-RPC error
    if (response.error) {
      const err = response.error as Record<string, unknown>;
      const errCode =
        typeof err.code === 'number'
          ? err.code
          : JsonRpcErrorCode.INTERNAL_ERROR;
      throw new Error(
        `External agent reported JSON-RPC error ${String(errCode)}`,
      );
    }

    // Expect JSON-RPC success response
    if (!response.result || typeof response.result !== 'object') {
      throw new Error(
        `External agent ${agentSlug} response missing result field`,
      );
    }

    const result = response.result as Record<string, unknown>;

    if (result.success !== true) {
      throw new Error(`External agent ${agentSlug} reported failure in result`);
    }

    const output = result.output as
      | A2AInvokeSuccessResponse['result']['output']
      | undefined;
    if (
      !output ||
      typeof output !== 'object' ||
      !OUTPUT_TYPES.has(output.outputType)
    ) {
      throw new Error(
        `External agent ${agentSlug} returned invalid output`,
      );
    }

    if (
      output.metadata !== undefined &&
      (typeof output.metadata !== 'object' ||
        output.metadata === null ||
        Array.isArray(output.metadata))
    ) {
      throw new Error(
        `External agent ${agentSlug} returned invalid output metadata`,
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

import { Injectable, Logger } from '@nestjs/common';
import type {
  A2AInvokeErrorResponse,
  A2AInvokeSuccessResponse,
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { MarketingSwarmService } from './marketing-swarm.service';
import { validateMarketingSwarmInvoke } from './marketing-swarm-invoke-validation';

/**
 * Marketing Swarm's own invoke contract, reached through the generic
 * `POST /workflows/invoke` controller (its `custom` entry point).
 *
 * The task and its configuration already exist in marketing.swarm_tasks
 * (created by the frontend); this runs the swarm synchronously and returns the
 * versioned deliverable.
 */
@Injectable()
export class MarketingSwarmInvokeService {
  private readonly logger = new Logger(MarketingSwarmInvokeService.name);

  constructor(private readonly marketingSwarmService: MarketingSwarmService) {}

  async invoke(
    body: unknown,
    userId: string,
    organizationSlug: string | undefined,
  ): Promise<A2AInvokeSuccessResponse | A2AInvokeErrorResponse> {
    const validation = validateMarketingSwarmInvoke(body, userId, organizationSlug);
    if (!validation.valid) {
      return {
        jsonrpc: '2.0',
        id: validation.id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: validation.message,
        },
      };
    }

    this.logger.log(
      `Received swarm invocation: conversationId=${validation.context.conversationId}`,
    );
    try {
      const result = await this.marketingSwarmService.execute(validation.input);
      if (!result.versionedDeliverable) {
        throw new Error('Marketing Swarm completed without a versioned deliverable');
      }

      return {
        jsonrpc: '2.0',
        id: validation.id,
        result: {
          success: true,
          output: {
            content: result.versionedDeliverable,
            outputType: 'json',
          },
          context: validation.context,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Marketing Swarm invocation failed: ${message}`);
      return {
        jsonrpc: '2.0',
        id: validation.id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Workflow invocation failed',
        },
      };
    }
  }
}

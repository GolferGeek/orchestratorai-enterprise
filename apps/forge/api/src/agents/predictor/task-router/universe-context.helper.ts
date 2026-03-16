/**
 * Universe Context Helper
 *
 * Provides utilities for resolving and validating universe context in dashboard handlers.
 * Most prediction operations are scoped to a universe - this helper enforces that pattern.
 *
 * Usage:
 * - universes.list: No universeId required (lists universes for the agent)
 * - All other operations: universeId required in params
 *
 * The helper also retrieves the universe's LLM config for use in predictions.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { UniverseRepository } from '../repositories/universe.repository';
import { Universe } from '../interfaces/universe.interface';
import {
  DashboardActionResult,
  buildDashboardError,
} from './dashboard-handler.interface';

export interface UniverseContext {
  universe: Universe;
  universeId: string;
}

export interface UniverseParams {
  universeId?: string;
}

@Injectable()
export class UniverseContextHelper {
  private readonly logger = new Logger(UniverseContextHelper.name);

  constructor(private readonly universeRepository: UniverseRepository) {}

  /**
   * Resolve universe from params, validating it exists and belongs to the agent.
   *
   * @param params - Request params containing universeId
   * @param context - Execution context with agentSlug and orgSlug
   * @returns UniverseContext or DashboardActionResult error
   */
  async resolveUniverse(
    params: UniverseParams | undefined,
    context: ExecutionContext,
  ): Promise<UniverseContext | DashboardActionResult> {
    const universeId = params?.universeId;

    if (!universeId) {
      return buildDashboardError(
        'MISSING_UNIVERSE_ID',
        'universeId is required. Call universes.list first to get available universes.',
        {
          hint: 'Use action "universes.list" to get universes for this agent',
          agentSlug: context.agentSlug,
        },
      );
    }

    try {
      const universe = await this.universeRepository.findById(universeId);

      if (!universe) {
        return buildDashboardError(
          'UNIVERSE_NOT_FOUND',
          `Universe not found: ${universeId}`,
        );
      }

      // Validate universe belongs to this agent
      if (universe.agent_slug !== context.agentSlug) {
        this.logger.warn(
          `Universe ${universeId} belongs to agent ${universe.agent_slug}, not ${context.agentSlug}`,
        );
        return buildDashboardError(
          'UNIVERSE_ACCESS_DENIED',
          `Universe ${universeId} does not belong to agent ${context.agentSlug}`,
        );
      }

      // Validate universe belongs to this organization
      if (universe.organization_slug !== context.orgSlug) {
        this.logger.warn(
          `Universe ${universeId} belongs to org ${universe.organization_slug}, not ${context.orgSlug}`,
        );
        return buildDashboardError(
          'UNIVERSE_ACCESS_DENIED',
          `Universe ${universeId} does not belong to organization ${context.orgSlug}`,
        );
      }

      return {
        universe,
        universeId: universe.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to resolve universe: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UNIVERSE_RESOLUTION_FAILED',
        error instanceof Error ? error.message : 'Failed to resolve universe',
      );
    }
  }

  /**
   * Check if the result is an error (DashboardActionResult) or success (UniverseContext)
   */
  isError(
    result: UniverseContext | DashboardActionResult,
  ): result is DashboardActionResult {
    return 'success' in result && result.success === false;
  }

  /**
   * Get the default/first universe for an agent.
   * Used when agent has single universe for convenience.
   *
   * @param context - Execution context with agentSlug and orgSlug
   * @returns Universe or null if none found
   */
  async getDefaultUniverse(
    context: ExecutionContext,
  ): Promise<Universe | null> {
    const universes = await this.universeRepository.findByAgentSlug(
      context.agentSlug,
      context.orgSlug,
    );

    if (universes.length === 0) {
      return null;
    }

    // Return first active universe
    return universes[0] ?? null;
  }

  /**
   * Get all universes for an agent.
   *
   * @param context - Execution context with agentSlug and orgSlug
   * @returns Array of universes
   */
  async getUniversesForAgent(context: ExecutionContext): Promise<Universe[]> {
    return this.universeRepository.findByAgentSlug(
      context.agentSlug,
      context.orgSlug,
    );
  }
}

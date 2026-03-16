import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  FeatureFlagService,
  FeatureFlagContext,
  FeatureFlagConfig,
} from './feature-flag.service';

@Controller('feature-flags')
export class FeatureFlagController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  /**
   * Get all feature flag configurations (admin only)
   */
  @Get()
  getAllFlags(): Record<string, FeatureFlagConfig> {
    return this.featureFlagService.getAllFlags();
  }

  /**
   * Check if a specific feature flag is enabled for a context
   */
  @Post('check')
  checkFlag(
    @Body() request: { flagName: string; context?: FeatureFlagContext },
  ): { flagName: string; enabled: boolean; context: FeatureFlagContext } {
    const enabled = this.featureFlagService.isEnabled(
      request.flagName,
      request.context || {},
    );

    return {
      flagName: request.flagName,
      enabled,
      context: request.context || {},
    };
  }

  /**
   * Check sovereign routing feature flag specifically
   */
  @Get('sovereign-routing')
  checkSovereignRouting(
    @Query('userId') userId?: string,
    @Query('organizationId') organizationId?: string,
  ): { enabled: boolean; context: FeatureFlagContext } {
    const context: FeatureFlagContext = { userId, organizationId };
    const enabled = this.featureFlagService.isSovereignRoutingEnabled(context);

    return { enabled, context };
  }

  /**
   * Get feature flag status for debugging
   */
  @Get('debug/:flagName')
  debugFlag(
    @Query('userId') userId?: string,
    @Query('organizationId') organizationId?: string,
    @Body() body?: { flagName: string },
  ): {
    flagName: string;
    config: FeatureFlagConfig;
    context: FeatureFlagContext;
    enabled: boolean;
    debugInfo: Record<string, unknown>;
  } {
    const flagName = body?.flagName || 'SOVEREIGN_ROUTING';
    const context: FeatureFlagContext = { userId, organizationId };

    // Get the raw configuration
    const config = (
      this.featureFlagService as unknown as {
        getFlagConfig: (name: string) => unknown;
      }
    ).getFlagConfig(flagName) as FeatureFlagConfig;
    const enabled = this.featureFlagService.isEnabled(flagName, context);

    // Debug information
    const debugInfo = {
      environmentVariables: {
        enabled: process.env[`FEATURE_FLAG_${flagName.toUpperCase()}_ENABLED`],
        rolloutPercentage:
          process.env[
            `FEATURE_FLAG_${flagName.toUpperCase()}_ROLLOUT_PERCENTAGE`
          ],
        targetUsers:
          process.env[`FEATURE_FLAG_${flagName.toUpperCase()}_TARGET_USERS`],
        targetOrganizations:
          process.env[
            `FEATURE_FLAG_${flagName.toUpperCase()}_TARGET_ORGANIZATIONS`
          ],
        excludeUsers:
          process.env[`FEATURE_FLAG_${flagName.toUpperCase()}_EXCLUDE_USERS`],
        excludeOrganizations:
          process.env[
            `FEATURE_FLAG_${flagName.toUpperCase()}_EXCLUDE_ORGANIZATIONS`
          ],
      },
    };

    return {
      flagName,
      config,
      context,
      enabled,
      debugInfo,
    };
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ExternalRegistryService } from '../registry/external-registry.service';

/**
 * DivinerBootstrapService — auto-discovers and registers Diviner.ai on startup.
 *
 * On module init this service:
 * 1. Reads DIVINER_DISCOVERY_URL, DIVINER_A2A_URL, and DIVINER_API_KEY from env.
 * 2. Calls ExternalRegistryService.discoverAgent() to fetch the agent card and
 *    persist the base record.
 * 3. Calls updateAgentConnection() to store the dedicated A2A endpoint and API key
 *    that are not present in the agent card itself.
 *
 * If any env variable is missing or discovery fails, an error is thrown so the
 * problem is visible at startup rather than hidden until first outbound call.
 */
@Injectable()
export class DivinerBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DivinerBootstrapService.name);

  constructor(private readonly registry: ExternalRegistryService) {}

  async onModuleInit(): Promise<void> {
    const discoveryUrl = process.env.DIVINER_DISCOVERY_URL;
    const a2aUrl = process.env.DIVINER_A2A_URL;
    const apiKey = process.env.DIVINER_API_KEY;

    if (!discoveryUrl || !a2aUrl || !apiKey) {
      this.logger.warn(
        'Diviner bootstrap skipped — DIVINER_DISCOVERY_URL, DIVINER_A2A_URL, and DIVINER_API_KEY must all be set',
      );
      return;
    }

    this.logger.log(`Bootstrapping Diviner from discovery URL: ${discoveryUrl}`);

    const agent = await this.registry.discoverAgent(discoveryUrl);

    this.logger.log(
      `Discovered Diviner agent "${agent.name}" (${agent.id}) — updating A2A endpoint and API key`,
    );

    await this.registry.updateAgentConnection(agent.id, a2aUrl, apiKey);

    this.logger.log(
      `Diviner bootstrap complete — outbound calls will go to ${a2aUrl}`,
    );
  }
}

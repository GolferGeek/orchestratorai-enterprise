import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';
import { AgentsRepository } from '../repositories/agents.repository';

@Injectable()
export class AgentRegistryInvalidationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AgentRegistryInvalidationService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastSeenUpdatedAt: string | null = null;

  constructor(
    private readonly registry: AgentRegistryService,
    private readonly agents: AgentsRepository,
  ) {}

  async onModuleInit() {
    const intervalMs = this.resolveInterval();
    this.logger.log(
      `Starting agent registry poller (interval=${intervalMs}ms)`,
    );
    await this.tick(true);
    this.timer = setInterval(() => {
      void this.tick(false);
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resolveInterval(): number {
    const raw = process.env.AGENT_REGISTRY_POLL_INTERVAL_MS;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1000) {
      return parsed;
    }
    return 15000; // default 15s
  }

  private async tick(firstRun: boolean) {
    try {
      const latest = await this.agents.getLatestUpdatedAt();
      if (firstRun) {
        this.lastSeenUpdatedAt = latest;
        return;
      }

      if (latest && latest !== this.lastSeenUpdatedAt) {
        this.logger.log(
          `Detected agent changes (updated_at changed). Clearing registry cache.`,
        );
        this.registry.clearAll();
        this.lastSeenUpdatedAt = latest;
      }
    } catch (error) {
      this.logger.warn(
        `Registry poller failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

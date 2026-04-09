import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LegalJobsRepository } from './legal-jobs.repository';

/**
 * Periodic cleanup of completed legal.agent_jobs rows older than the
 * configured retention window.
 *
 * - Runs once per hour (CLEANUP_INTERVAL_MS)
 * - Only deletes `completed` jobs — `failed` and `canceled` are kept
 *   indefinitely for postmortem analysis
 * - Retention window configurable via LEGAL_JOB_RETENTION_DAYS env var
 *   (default 90, 0 = disabled)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class LegalJobsCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LegalJobsCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly retentionDays: number;

  constructor(
    private readonly repository: LegalJobsRepository,
    private readonly configService: ConfigService,
  ) {
    this.retentionDays = parseInt(
      this.configService.get<string>('LEGAL_JOB_RETENTION_DAYS', '90'),
      10,
    );
  }

  onModuleInit(): void {
    if (this.retentionDays <= 0) {
      this.logger.log(
        'Job retention cleanup disabled (LEGAL_JOB_RETENTION_DAYS=0)',
      );
      return;
    }
    this.logger.log(
      `Job retention cleanup enabled: ${this.retentionDays} days, interval ${CLEANUP_INTERVAL_MS / 1000}s`,
    );
    this.timer = setInterval(() => {
      void this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async cleanup(): Promise<number> {
    try {
      const count = await this.repository.deleteOlderThan(
        this.retentionDays,
        'completed',
      );
      if (count > 0) {
        this.logger.log(
          `Cleaned up ${count} completed jobs older than ${this.retentionDays} days`,
        );
      }
      return count;
    } catch (error) {
      this.logger.error(
        `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}

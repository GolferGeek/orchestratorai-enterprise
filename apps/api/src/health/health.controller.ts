import { Controller, Get, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { BUSINESS_DATABASE_SERVICE, DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';

interface HealthResponse {
  status: 'ok';
  service: 'platform-api';
}

interface DatabasesHealth {
  platform: 'ok' | 'error';
  business: 'ok' | 'error';
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly platformDb: DatabaseService,
    @Inject(BUSINESS_DATABASE_SERVICE) private readonly businessDb: DatabaseService,
  ) {}

  /** Liveness only: the API answers. The deploy waits on this. */
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'platform-api',
    };
  }

  /**
   * Both connections: the platform database (agents, runs, events) and the
   * company database (customers, orders, logins). 503 when either fails; the
   * reason is logged, not sent, since this endpoint is public.
   */
  @Get('databases')
  async getDatabases(): Promise<DatabasesHealth> {
    const check = async (name: keyof DatabasesHealth, db: DatabaseService): Promise<'ok' | 'error'> => {
      const result = await db.checkConnection();
      if (result.status === 'ok') return 'ok';
      this.logger.error(`The ${name} database connection failed: ${result.message}`);
      return 'error';
    };
    const health: DatabasesHealth = {
      platform: await check('platform', this.platformDb),
      business: await check('business', this.businessDb),
    };
    if (health.platform !== 'ok' || health.business !== 'ok') {
      throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return health;
  }
}

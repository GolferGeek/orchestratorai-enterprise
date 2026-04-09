import { Controller, Get } from '@nestjs/common';
import { Public } from '@orchestratorai/auth-client';

// Liveness probe — must be reachable without auth.
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      product: 'pulse',
      timestamp: new Date().toISOString(),
    };
  }
}

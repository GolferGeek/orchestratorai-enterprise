import { Controller, Get } from '@nestjs/common';
import { Public } from '@orchestratorai/auth-client';

// Liveness probe
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      product: 'bridge',
      version: '0.1.0',
      port: parseInt(process.env.PORT ?? '5600', 10),
      timestamp: new Date().toISOString(),
    };
  }
}

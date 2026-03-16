import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      product: 'bridge',
      version: '0.1.0',
      port: parseInt(process.env.PORT ?? '6600', 10),
      timestamp: new Date().toISOString(),
    };
  }
}

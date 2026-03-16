import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      app: 'content-forge',
      port: 4003,
      timestamp: new Date().toISOString(),
    };
  }
}

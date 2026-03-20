import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      app: 'content-forge',
      port: 6405,
      timestamp: new Date().toISOString(),
    };
  }
}

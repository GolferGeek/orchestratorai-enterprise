import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'ascentek-app',
      timestamp: new Date().toISOString(),
    };
  }
}

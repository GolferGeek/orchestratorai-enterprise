import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      app: 'prairie-ridge-app',
      timestamp: new Date().toISOString(),
    };
  }
}

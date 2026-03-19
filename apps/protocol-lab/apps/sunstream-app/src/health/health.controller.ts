import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      app: 'sunstream-app',
      timestamp: new Date().toISOString(),
    };
  }
}

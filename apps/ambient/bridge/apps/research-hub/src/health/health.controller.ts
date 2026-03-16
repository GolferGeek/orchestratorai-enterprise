import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      app: 'research-hub',
      timestamp: new Date().toISOString(),
    };
  }
}

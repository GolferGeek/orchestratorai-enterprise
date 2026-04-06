import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      app: 'content-forge',
      port: parseInt(process.env.PROTOCOL_LAB_CONTENT_FORGE_PORT ?? '5405', 10),
      timestamp: new Date().toISOString(),
    };
  }
}

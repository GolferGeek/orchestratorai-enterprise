import { Controller, Get } from '@nestjs/common';

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

import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@Controller('secure-conversations/health')
export class SecureConversationsHealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'secure-conversations',
      port: process.env.PLATFORM_API_PORT,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * NestJS module that provides a fully-registered ProtocolFactory.
 * Import this module into any agent app that needs factory-driven provider resolution.
 */
import { Module, Global } from '@nestjs/common';
import { ProtocolFactoryService } from './protocol-factory.service';

@Global()
@Module({
  providers: [ProtocolFactoryService],
  exports: [ProtocolFactoryService],
})
export class ProtocolFactoryModule {}

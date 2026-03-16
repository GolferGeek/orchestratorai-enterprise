import { Global, Module } from '@nestjs/common';
import { BridgeProtocolService } from './bridge-protocol.service';

/**
 * ProtocolModule — Global module providing BridgeProtocolService.
 *
 * Marked @Global() so all other Bridge modules can inject BridgeProtocolService
 * without importing this module explicitly.
 */
@Global()
@Module({
  providers: [BridgeProtocolService],
  exports: [BridgeProtocolService],
})
export class ProtocolModule {}

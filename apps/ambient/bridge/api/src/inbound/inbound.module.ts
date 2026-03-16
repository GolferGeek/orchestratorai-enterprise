import { Module } from '@nestjs/common';
import { A2AReceiverController } from './a2a-receiver.controller';
import { A2AMessagesController } from './a2a-messages.controller';
import { A2AValidatorService } from './a2a-validator.service';
import { A2ARouterService } from './a2a-router.service';
import { SecurityModule } from '../security/security.module';

/**
 * InboundModule — handles all inbound A2A traffic from external agents.
 *
 * BridgeDatabaseService and BridgeProtocolService are provided by their respective
 * global modules (BridgeDatabaseModule, ProtocolModule) and are available here
 * without explicit import.
 */
@Module({
  imports: [SecurityModule],
  controllers: [A2AReceiverController, A2AMessagesController],
  providers: [A2AValidatorService, A2ARouterService],
  exports: [A2ARouterService],
})
export class InboundModule {}

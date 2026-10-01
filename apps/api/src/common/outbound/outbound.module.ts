import { Module } from '@nestjs/common';
import { OutboundUrlValidatorService } from './outbound-url-validator.service';

/**
 * Outbound HTTP safety shared by everything that calls a URL it did not
 * choose itself (Gatehouse A2A client, API/media agent runners, competitor
 * watch). The validator blocks private and loopback targets unless
 * OUTBOUND_ALLOW_PRIVATE_NETWORKS is set.
 */
@Module({
  providers: [OutboundUrlValidatorService],
  exports: [OutboundUrlValidatorService],
})
export class OutboundModule {}

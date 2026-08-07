import { Module } from '@nestjs/common';
import { SigningService } from './signing.service';
import { RateLimiterService } from './rate-limiter.service';
import { OriginValidatorService } from './origin-validator.service';
import { OutboundUrlValidatorService } from './outbound-url-validator.service';

@Module({
  providers: [
    SigningService,
    RateLimiterService,
    OriginValidatorService,
    OutboundUrlValidatorService,
  ],
  exports: [
    SigningService,
    RateLimiterService,
    OriginValidatorService,
    OutboundUrlValidatorService,
  ],
})
export class SecurityModule {}

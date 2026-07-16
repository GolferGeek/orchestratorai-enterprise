import { Module } from '@nestjs/common';
import { SigningService } from './signing.service';
import { RateLimiterService } from './rate-limiter.service';
import { OriginValidatorService } from './origin-validator.service';

@Module({
  providers: [SigningService, RateLimiterService, OriginValidatorService],
  exports: [SigningService, RateLimiterService, OriginValidatorService],
})
export class SecurityModule {}

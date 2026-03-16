import { Module } from '@nestjs/common';
import { CustomerServiceController } from './customer-service.controller';
import { CustomerServiceService } from './customer-service.service';
import { GuestSessionGuard } from './guards/guest-session.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { CustomerServiceAnalyticsService } from './analytics/customer-service-analytics.service';
import { ObservabilityModule } from '../observability/observability.module';
import { CustomerServiceAgentModule } from '../agents/customer-service/customer-service.module';

@Module({
  imports: [ObservabilityModule, CustomerServiceAgentModule],
  controllers: [CustomerServiceController],
  providers: [
    CustomerServiceService,
    GuestSessionGuard,
    RateLimitGuard,
    CustomerServiceAnalyticsService,
  ],
  exports: [
    CustomerServiceService,
    GuestSessionGuard,
    RateLimitGuard,
    CustomerServiceAnalyticsService,
  ],
})
export class CustomerServiceModule {}

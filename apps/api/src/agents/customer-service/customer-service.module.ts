import { Module } from '@nestjs/common';
import { CustomerServiceController } from './customer-service.controller';
import { CustomerServiceService } from './customer-service.service';
import { GuestSessionGuard } from './guards/guest-session.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { CustomerServiceAgentModule } from './agent/customer-service.module';
import { PersistenceModule } from '../../workflows/shared/persistence/persistence.module';
import { SharedServicesModule } from '../../workflows/shared/services/shared-services.module';

@Module({
  imports: [SharedServicesModule, PersistenceModule, CustomerServiceAgentModule],
  controllers: [CustomerServiceController],
  providers: [
    CustomerServiceService,
    GuestSessionGuard,
    RateLimitGuard,
  ],
  exports: [
    CustomerServiceService,
    GuestSessionGuard,
    RateLimitGuard,
  ],
})
export class CustomerServiceModule {}

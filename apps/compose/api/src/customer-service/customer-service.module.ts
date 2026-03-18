/**
 * CustomerServiceModule
 *
 * Provides the guest session controller and service for the landing page
 * customer-service chat widget. Imports InvokeModule so it can call
 * InvokeDispatchService.
 */

import { Module } from '@nestjs/common';
import { CustomerServiceController } from './customer-service.controller';
import { CustomerServiceService } from './customer-service.service';
import { InvokeModule } from '../invoke/invoke.module';

@Module({
  imports: [InvokeModule],
  controllers: [CustomerServiceController],
  providers: [CustomerServiceService],
})
export class CustomerServiceModule {}

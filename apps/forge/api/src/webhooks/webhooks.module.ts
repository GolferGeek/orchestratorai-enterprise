import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [ObservabilityModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}

import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { ProtocolModule } from './protocol/protocol.module';
import { AgentsModule } from './agents/agents.module';
import { MessagesModule } from './messages/messages.module';
import { WsModule } from './ws/ws.module';
import { WalletModule } from './wallet/wallet.module';
import { TrustModule } from './trust/trust.module';
import { ExportModule } from './export/export.module';
import { AsyncPatternsModule } from './async-patterns/async-patterns.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [ProtocolModule, AgentsModule, MessagesModule, WsModule, WalletModule, TrustModule, ExportModule, AsyncPatternsModule, PaymentModule],
  controllers: [HealthController],
})
export class AppModule {}

import { Module, OnModuleInit } from '@nestjs/common';
import { InvokeModule } from '../agents/invoke/invoke.module';
import { InvokeDispatchService } from '../agents/invoke/invoke-dispatch.service';
import { AmbientEventsModule } from '../ambient/events/events.module';
import { OutboundModule } from '../common/outbound/outbound.module';
import { A2AAgentsService } from './a2a-agents.service';
import { A2AClientService } from './a2a-client.service';
import { GatehouseAdminController } from './admin.controller';
import { CallerAuthService } from './caller-auth.service';
import { CallersAdminController, GatehousePublicController } from './callers.controller';
import { CallersRepository } from './callers.repository';
import { GatehouseKeysService } from './gatehouse-keys.service';
import { GatehouseInboundController } from './inbound.controller';
import { GatehouseInboundService } from './inbound.service';
import { OutboundCallsRepository } from './outbound-calls.repository';
import { PartnerCallsService } from './partner-calls.service';
import { TasksRepository } from './tasks.repository';
import { GatehouseReplyService } from './reply.service';
import { A2AFamilyRunner } from './a2a-family.runner';

/**
 * The Gatehouse: the platform's A2A boundary. Its outbound side (the A2A v1.0
 * client), the runner for agents of family 'a2a' (registered with the invoke
 * dispatcher), and caller identity: registered callers with public keys, and
 * our own signing key. Nothing depends on this module, so it
 * can reach agents, ambient and workflows without a cycle.
 */
@Module({
  imports: [InvokeModule, AmbientEventsModule, OutboundModule],
  controllers: [GatehousePublicController, CallersAdminController, GatehouseAdminController, GatehouseInboundController],
  providers: [
    A2AAgentsService,
    A2AClientService,
    A2AFamilyRunner,
    OutboundCallsRepository,
    PartnerCallsService,
    CallersRepository,
    CallerAuthService,
    GatehouseKeysService,
    TasksRepository,
    GatehouseInboundService,
    GatehouseReplyService,
  ],
  exports: [A2AClientService, CallerAuthService, GatehouseKeysService, PartnerCallsService],
})
export class GatehouseModule implements OnModuleInit {
  constructor(
    private readonly dispatch: InvokeDispatchService,
    private readonly runner: A2AFamilyRunner,
  ) {}

  onModuleInit(): void {
    this.dispatch.registerRunner('a2a', this.runner);
  }
}

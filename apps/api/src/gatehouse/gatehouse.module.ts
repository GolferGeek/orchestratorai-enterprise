import { Module, OnModuleInit } from '@nestjs/common';
import { InvokeModule } from '../agents/invoke/invoke.module';
import { InvokeDispatchService } from '../agents/invoke/invoke-dispatch.service';
import { AmbientEventsModule } from '../ambient/events/events.module';
import { SecurityModule } from '../secure-conversations/security/security.module';
import { A2AClientService } from './a2a-client.service';
import { CallerAuthService } from './caller-auth.service';
import { CallersAdminController, GatehousePublicController } from './callers.controller';
import { CallersRepository } from './callers.repository';
import { GatehouseKeysService } from './gatehouse-keys.service';
import { GatehouseInboundController } from './inbound.controller';
import { GatehouseInboundService } from './inbound.service';
import { TasksRepository } from './tasks.repository';
import { A2AFamilyRunner } from './a2a-family.runner';

/**
 * The Gatehouse: the platform's A2A boundary. Its outbound side (the A2A v1.0
 * client), the runner for agents of family 'a2a' (registered with the invoke
 * dispatcher), and caller identity: registered callers with public keys, and
 * our own signing key. Nothing depends on this module, so it
 * can reach agents, ambient and workflows without a cycle.
 */
@Module({
  imports: [InvokeModule, AmbientEventsModule, SecurityModule],
  controllers: [GatehousePublicController, CallersAdminController, GatehouseInboundController],
  providers: [
    A2AClientService,
    A2AFamilyRunner,
    CallersRepository,
    CallerAuthService,
    GatehouseKeysService,
    TasksRepository,
    GatehouseInboundService,
  ],
  exports: [A2AClientService, CallerAuthService, GatehouseKeysService],
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

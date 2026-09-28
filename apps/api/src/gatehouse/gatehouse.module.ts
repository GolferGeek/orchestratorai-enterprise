import { Module, OnModuleInit } from '@nestjs/common';
import { InvokeModule } from '../agents/invoke/invoke.module';
import { InvokeDispatchService } from '../agents/invoke/invoke-dispatch.service';
import { AmbientEventsModule } from '../ambient/events/events.module';
import { SecurityModule } from '../secure-conversations/security/security.module';
import { A2AClientService } from './a2a-client.service';
import { A2AFamilyRunner } from './a2a-family.runner';

/**
 * The Gatehouse: the platform's A2A boundary. Today its outbound side (the
 * A2A v1.0 client) and the runner for agents of family 'a2a', which it
 * registers with the invoke dispatcher. Nothing depends on this module, so it
 * can reach agents, ambient and workflows without a cycle.
 */
@Module({
  imports: [InvokeModule, AmbientEventsModule, SecurityModule],
  providers: [A2AClientService, A2AFamilyRunner],
  exports: [A2AClientService],
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

/**
 * Family Runners Module
 *
 * Provides and registers the in-agents FamilyRunner implementations with
 * InvokeDispatchService on module initialization.
 *
 * Families registered:
 *   context  — ContextFamilyRunner
 *   rag      — RagFamilyRunner
 *   api      — ApiFamilyRunner
 *
 * The 'a2a' family is registered by the Gatehouse module (src/gatehouse/),
 * because its targets reach ambient and other agents.
 *   media    — MediaFamilyRunner
 */

import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InvokeDispatchService } from '../invoke-dispatch.service';
import { InvokeModule } from '../invoke.module';
import { ContextFamilyRunner } from './context-family.runner';
import { RagFamilyRunner } from './rag-family.runner';
import { ApiFamilyRunner } from './api-family.runner';
import { MediaFamilyRunner } from './media-family.runner';
import { SecurityModule } from '../../../secure-conversations/security/security.module';

@Module({
  imports: [HttpModule, SecurityModule, forwardRef(() => InvokeModule)],
  providers: [
    ContextFamilyRunner,
    RagFamilyRunner,
    ApiFamilyRunner,
    MediaFamilyRunner,
  ],
  exports: [
    ContextFamilyRunner,
    RagFamilyRunner,
    ApiFamilyRunner,
    MediaFamilyRunner,
  ],
})
export class FamilyRunnersModule implements OnModuleInit {
  constructor(
    private readonly dispatch: InvokeDispatchService,
    private readonly contextRunner: ContextFamilyRunner,
    private readonly ragRunner: RagFamilyRunner,
    private readonly apiRunner: ApiFamilyRunner,
    private readonly mediaRunner: MediaFamilyRunner,
  ) {}

  onModuleInit(): void {
    this.dispatch.registerRunner('context', this.contextRunner);
    this.dispatch.registerRunner('rag', this.ragRunner);
    this.dispatch.registerRunner('api', this.apiRunner);
    this.dispatch.registerRunner('media', this.mediaRunner);
  }
}

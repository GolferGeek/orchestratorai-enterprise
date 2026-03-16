/**
 * Family Runners Module
 *
 * Provides and registers all 5 FamilyRunner implementations with
 * InvokeDispatchService on module initialization.
 *
 * Families registered:
 *   context  — ContextFamilyRunner
 *   rag      — RagFamilyRunner
 *   api      — ApiFamilyRunner
 *   external — ExternalFamilyRunner
 *   media    — MediaFamilyRunner
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InvokeDispatchService } from '../invoke-dispatch.service';
import { ContextFamilyRunner } from './context-family.runner';
import { RagFamilyRunner } from './rag-family.runner';
import { ApiFamilyRunner } from './api-family.runner';
import { ExternalFamilyRunner } from './external-family.runner';
import { MediaFamilyRunner } from './media-family.runner';
import { RagModule } from '@/rag/rag.module';

@Module({
  imports: [
    HttpModule,
    RagModule,
  ],
  providers: [
    ContextFamilyRunner,
    RagFamilyRunner,
    ApiFamilyRunner,
    ExternalFamilyRunner,
    MediaFamilyRunner,
  ],
  exports: [
    ContextFamilyRunner,
    RagFamilyRunner,
    ApiFamilyRunner,
    ExternalFamilyRunner,
    MediaFamilyRunner,
  ],
})
export class FamilyRunnersModule implements OnModuleInit {
  constructor(
    private readonly dispatch: InvokeDispatchService,
    private readonly contextRunner: ContextFamilyRunner,
    private readonly ragRunner: RagFamilyRunner,
    private readonly apiRunner: ApiFamilyRunner,
    private readonly externalRunner: ExternalFamilyRunner,
    private readonly mediaRunner: MediaFamilyRunner,
  ) {}

  onModuleInit(): void {
    this.dispatch.registerRunner('context', this.contextRunner);
    this.dispatch.registerRunner('rag', this.ragRunner);
    this.dispatch.registerRunner('api', this.apiRunner);
    this.dispatch.registerRunner('external', this.externalRunner);
    this.dispatch.registerRunner('media', this.mediaRunner);
  }
}

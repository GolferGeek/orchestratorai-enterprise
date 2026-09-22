import { Module } from '@nestjs/common';
import { LLMModule } from '@orchestratorai/planes/llm';
import { PrivacyAdminController } from './privacy-admin.controller';
import { PrivacyAdminService } from './privacy-admin.service';

/**
 * LLMModule is imported for the PII services that back this surface
 * (PIIPatternService, PIIService, DictionaryPseudonymizerService,
 * PatternRedactionService). Nest resolves it to the same instance the LLM
 * plane uses, so pattern reloads and dictionary cache clears issued here take
 * effect on the live request path.
 */
@Module({
  imports: [LLMModule],
  controllers: [PrivacyAdminController],
  providers: [PrivacyAdminService],
})
export class PrivacyAdminModule {}

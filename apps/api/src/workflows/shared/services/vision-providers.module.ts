/**
 * VisionProvidersModule — exposes the VISION_LLM_CALLER token globally so
 * the extractors plane's VisionExtractorService can find it.
 *
 * DI note: AppModule's own providers are NOT visible to modules it imports
 * (e.g. the @Global ExtractorsModule). But providers declared in a @Global()
 * module ARE visible to every other module via the global provider registry.
 * So we wrap our OllamaVisionCaller in a global module.
 */
import { Global, Module } from '@nestjs/common';
import { VISION_LLM_CALLER } from '@orchestratorai/planes/extractors';
import { OllamaVisionCaller } from './ollama-vision-caller.service';

@Global()
@Module({
  providers: [
    OllamaVisionCaller,
    { provide: VISION_LLM_CALLER, useExisting: OllamaVisionCaller },
  ],
  exports: [OllamaVisionCaller, VISION_LLM_CALLER],
})
export class VisionProvidersModule {}

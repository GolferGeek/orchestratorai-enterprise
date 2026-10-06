/**
 * LLM Plane Module
 *
 * @Global() module providing LLM_SERVICE — the 7th provider plane.
 *
 * Selected by LLM_PROVIDER, which must be fine_control: full provider routing
 * via LLMService, with the before/after layer (PII, usage). Vendors are
 * backends under it, chosen per request by ExecutionContext.provider.
 * openrouter, azure_foundry, vertex_ai and simplified refuse to start (see
 * the factory below and docs/architecture/llm-boundary.md).
 *
 * The fine_control LLMModule (./fine-control/llm.module.ts) provides
 * all the internal services (generation, image, video, PII, etc.).
 */
import { Module, Global, Logger } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { LLM_SERVICE } from './llm.interface';
import { LLMService } from './fine-control/llm.service';
import { SimplifiedLLMService } from './simplified/simplified-llm.service';
import { OpenRouterClient } from './openrouter/openrouter.client';
import { OllamaCloudClient } from './simplified/ollama-cloud.client';
import { ModelRouter } from './simplified/model-router';
import { TwoTierLLMService } from './simplified/two-tier-llm.service';
import {
  COMMERCIAL_CLIENT,
  OPENSOURCE_CLIENT,
} from './simplified/llm-client.interface';
import { OpenRouterAdapter } from './simplified/adapters/openrouter.adapter';
import { OllamaCloudAdapter } from './simplified/adapters/ollama-cloud.adapter';
import { OllamaLocalAdapter } from './simplified/adapters/ollama-local.adapter';
import { LMStudioAdapter } from './simplified/adapters/lm-studio.adapter';
import { AzureFoundryAdapter } from './simplified/adapters/azure-foundry.adapter';
import { VertexAIAdapter } from './simplified/adapters/vertex-ai.adapter';
import { NullAdapter } from './simplified/adapters/null.adapter';
import { AzureFoundryLLMService } from './azure-foundry/azure-foundry-llm.service';
import { VertexAILLMService } from './vertex-ai/vertex-ai-llm.service';
import { ObservabilityPlaneModule } from '@orchestratorai/planes/observability';
import { LLMModule } from './fine-control/llm.module';


const logger = new Logger('LLMPlaneModule');

@Global()
@Module({
  imports: [HttpModule, ObservabilityPlaneModule, LLMModule],
  providers: [
    // Simplified provider components (always registered, only used when selected)
    // NOTE: OpenRouterClient is provided by LLMModule (imported above) so the
    // factory and these services share one instance.
    OllamaCloudClient,
    ModelRouter,
    SimplifiedLLMService,
    TwoTierLLMService,
    // Cloud provider services (always registered, only used when selected)
    AzureFoundryLLMService,
    VertexAILLMService,
    // Two-tier client factories: commercial + opensource backends
    {
      provide: COMMERCIAL_CLIENT,
      useFactory: (
        openRouterClient: OpenRouterClient,
        azureFoundryService: AzureFoundryLLMService,
        vertexAIService: VertexAILLMService,
      ) => {
        const provider = process.env.COMMERCIAL_LLM_PROVIDER || 'openrouter';
        logger.log(`Commercial LLM provider: ${provider}`);
        switch (provider) {
          case 'openrouter':
            return new OpenRouterAdapter(openRouterClient);
          case 'azure_foundry':
            return new AzureFoundryAdapter(azureFoundryService);
          case 'vertex_ai':
            return new VertexAIAdapter(vertexAIService);
          case 'none':
            return new NullAdapter('commercial');
          default:
            throw new Error(
              `Unsupported COMMERCIAL_LLM_PROVIDER '${provider}'. ` +
                `Expected: openrouter, azure_foundry, vertex_ai, none`,
            );
        }
      },
      inject: [OpenRouterClient, AzureFoundryLLMService, VertexAILLMService],
    },
    {
      provide: OPENSOURCE_CLIENT,
      useFactory: (
        ollamaCloudClient: OllamaCloudClient,
        httpService: HttpService,
      ) => {
        const provider = process.env.OPENSOURCE_LLM_PROVIDER || 'ollama_cloud';
        logger.log(`Open source LLM provider: ${provider}`);
        switch (provider) {
          case 'ollama_cloud':
            return new OllamaCloudAdapter(ollamaCloudClient);
          case 'ollama_local':
            return new OllamaLocalAdapter(httpService);
          case 'lm_studio':
            return new LMStudioAdapter(httpService);
          case 'none':
            return new NullAdapter('opensource');
          default:
            throw new Error(
              `Unsupported OPENSOURCE_LLM_PROVIDER '${provider}'. ` +
                `Expected: ollama_cloud, ollama_local, lm_studio, none`,
            );
        }
      },
      inject: [OllamaCloudClient, HttpService],
    },
    // Factory: select the LLM plane implementation.
    //
    // SECURITY CRITICAL — read docs/architecture/llm-boundary.md before adding
    // a case here.
    //
    // `fine_control` is not "one of the options": it is the path that has the
    // before/after layer (pseudonymization, redaction, usage recording). A
    // vendor is meant to be a *backend* selected per request by
    // ExecutionContext.provider — openai, anthropic, google, grok, ollama,
    // ollama-cloud, openrouter — not a separate plane.
    //
    // The other cases below predate that rule. Each is a parallel stack that
    // bypasses the before/after entirely, which silently disabled PII
    // protection and kept their traffic out of llm_usage. They now refuse to
    // start rather than run unprotected.
    {
      provide: LLM_SERVICE,
      useFactory: (llmService: LLMService) => {
        const provider = process.env.LLM_PROVIDER;
        logger.log(`LLM plane provider: ${provider}`);

        switch (provider) {
          case 'fine_control':
            return llmService;

          case 'openrouter':
            // OpenRouter is now a backend under fine_control, reached by
            // setting ExecutionContext.provider = 'openrouter'. Selecting it
            // as a plane would route around the PII boundary.
            throw new Error(
              "LLM_PROVIDER='openrouter' is no longer a plane. Set " +
                "LLM_PROVIDER=fine_control and select OpenRouter per request " +
                'via ExecutionContext.provider. See ' +
                'docs/architecture/llm-boundary.md.',
            );

          case 'azure_foundry':
          case 'vertex_ai':
            // Both are now backends under fine_control, same as OpenRouter.
            throw new Error(
              `LLM_PROVIDER='${provider}' is no longer a plane. Set ` +
                'LLM_PROVIDER=fine_control and select it per request via ' +
                `ExecutionContext.provider = '${provider}'. See ` +
                'docs/architecture/llm-boundary.md.',
            );

          case 'simplified':
            throw new Error(
              "LLM_PROVIDER='simplified' bypasses the PII boundary and usage " +
                'recording, so it refuses to start. Port it to a BaseLLMService ' +
                'backend under LLMServiceFactory first — see ' +
                'docs/architecture/llm-boundary.md.',
            );

          default:
            throw new Error(
              `Unsupported LLM_PROVIDER '${provider}'. Expected: fine_control`,
            );
        }
      },
      inject: [LLMService],
    },
  ],
  exports: [LLM_SERVICE],
})
export class LLMPlaneModule {}

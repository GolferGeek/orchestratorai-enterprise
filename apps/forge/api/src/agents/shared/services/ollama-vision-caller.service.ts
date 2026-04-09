/**
 * OllamaVisionCaller — implements the `VisionLlmCaller` port from
 * `@orchestratorai/planes/extractors` by routing through `LLM_SERVICE`.
 *
 * The LLM plane's Ollama provider (OllamaLLMService.generateResponse) now
 * correctly forwards `params.images` via /api/chat when images are present,
 * so there is no longer any reason to call Ollama directly (PLANES-002 fix).
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import type {
  VisionLlmCaller,
  VisionExecutionContext,
} from '@orchestratorai/planes/extractors';
import { LLM_SERVICE } from '@orchestratorai/planes/llm';
import type { LLMServiceProvider, LLMResponse } from '@orchestratorai/planes/llm';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

@Injectable()
export class OllamaVisionCaller implements VisionLlmCaller {
  private readonly logger = new Logger(OllamaVisionCaller.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  async callVisionModel(args: {
    systemPrompt: string;
    userPrompt: string;
    base64Image: string;
    mimeType: string;
    provider: string;
    model: string;
    context: VisionExecutionContext;
  }): Promise<{ text: string }> {
    // OllamaVisionCaller is Ollama-only. Cloud providers go through the normal
    // LLM plane without needing this dedicated adapter.
    if (args.provider !== 'ollama') {
      throw new Error(
        `OllamaVisionCaller can only handle provider='ollama'; got provider='${args.provider}'. Configure the image role to use Ollama for on-device vision.`,
      );
    }

    this.logger.log(
      `[VISION] ollama model=${args.model} conv=${args.context.conversationId} (${args.base64Image.length} base64 chars, mime=${args.mimeType})`,
    );

    const executionContext: ExecutionContext = {
      orgSlug: args.context.orgSlug,
      userId: args.context.userId,
      conversationId: args.context.conversationId,
      agentSlug: args.context.agentSlug,
      agentType: args.context.agentType,
      provider: args.provider,
      model: args.model,
      sovereignMode: args.context.sovereignMode,
    };

    const startedAt = Date.now();

    const result = await this.llmService.generateResponse(
      args.systemPrompt,
      args.userPrompt,
      {
        executionContext,
        images: [{ base64: args.base64Image, mimeType: args.mimeType }],
        temperature: 0,
        callerType: 'agent',
        callerName: 'ollama-vision-caller',
      },
    );

    const elapsed = Date.now() - startedAt;
    const text = typeof result === 'string' ? result : (result as LLMResponse).content;

    this.logger.log(
      `[VISION] ollama responded in ${elapsed}ms (${text.length} chars)`,
    );

    return { text };
  }
}

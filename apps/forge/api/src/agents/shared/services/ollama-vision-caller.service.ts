/**
 * OllamaVisionCaller — implements the `VisionLlmCaller` port from
 * `@orchestratorai/planes/extractors` by calling Ollama's /api/chat endpoint
 * directly with the `images` field.
 *
 * Why not go through LLM_SERVICE (two-tier) for this? The two-tier service's
 * `generateResponse()` accepts an `images` option in its type signature but
 * silently drops it when forwarding to the underlying `chatCompletion()` —
 * images never reach the model. Until the plane is upgraded we call Ollama
 * directly for vision.
 *
 * Gemma 4's 8B `e4b` variant ships with a 16-block ViT baked into the gguf
 * and reports vision as a native capability. See:
 * https://ai.google.dev/gemma/docs/core/model_card_4
 */
import { Injectable, Logger } from '@nestjs/common';
import type {
  VisionLlmCaller,
  VisionExecutionContext,
} from '@orchestratorai/planes/extractors';

interface OllamaChatResponse {
  model: string;
  message?: { role: string; content?: string };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
}

@Injectable()
export class OllamaVisionCaller implements VisionLlmCaller {
  private readonly logger = new Logger(OllamaVisionCaller.name);
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.logger.log(`OllamaVisionCaller initialized (base=${this.baseUrl})`);
  }

  async callVisionModel(args: {
    systemPrompt: string;
    userPrompt: string;
    base64Image: string;
    mimeType: string;
    provider: string;
    model: string;
    context: VisionExecutionContext;
  }): Promise<{ text: string }> {
    // Ollama only — cloud providers go through the normal LLM plane, not this
    // vision caller.
    if (args.provider !== 'ollama') {
      throw new Error(
        `OllamaVisionCaller can only handle provider='ollama'; got provider='${args.provider}'. Configure the image role to use Ollama for on-device vision.`,
      );
    }

    this.logger.log(
      `🔍 [VISION] ollama /api/chat model=${args.model} conv=${args.context.conversationId} (${args.base64Image.length} base64 chars, mime=${args.mimeType})`,
    );

    const startedAt = Date.now();
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: args.model,
        stream: false,
        messages: [
          { role: 'system', content: args.systemPrompt },
          {
            role: 'user',
            content: args.userPrompt,
            images: [args.base64Image],
          },
        ],
        options: {
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Ollama vision call failed: ${response.status} ${response.statusText} — ${detail}`,
      );
    }

    const body = (await response.json()) as OllamaChatResponse;
    const text = body.message?.content ?? '';
    const elapsed = Date.now() - startedAt;

    this.logger.log(
      `🔍 [VISION] ollama responded in ${elapsed}ms (${text.length} chars)`,
    );

    return { text };
  }
}

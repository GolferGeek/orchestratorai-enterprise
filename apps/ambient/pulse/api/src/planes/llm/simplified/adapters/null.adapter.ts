/**
 * Null Adapter
 *
 * No-op LLMClient implementation for when a tier is set to 'none'.
 * Returns empty model list and throws on chat attempts.
 */
import {
  LLMClient,
  LLMClientModelEntry,
  LLMClientChatParams,
  LLMClientChatResult,
} from '../llm-client.interface';

export class NullAdapter implements LLMClient {
  readonly tier: 'commercial' | 'opensource';

  constructor(tier: 'commercial' | 'opensource') {
    this.tier = tier;
  }

  listModels(): Promise<LLMClientModelEntry[]> {
    return Promise.resolve([]);
  }

  chatCompletion(_params: LLMClientChatParams): Promise<LLMClientChatResult> {
    return Promise.reject(
      new Error(
        `LLM ${this.tier} tier is disabled (set to 'none'). ` +
          `Configure ${this.tier === 'commercial' ? 'COMMERCIAL_LLM_PROVIDER' : 'OPENSOURCE_LLM_PROVIDER'} ` +
          `to enable this tier.`,
      ),
    );
  }
}

import { TwoTierLLMService } from './two-tier-llm.service';
import type { LLMClient, LLMClientModelEntry } from './llm-client.interface';

function client(tier: 'commercial' | 'opensource', listModels: () => Promise<LLMClientModelEntry[]>): LLMClient {
  return { tier, listModels: jest.fn(listModels), chatCompletion: jest.fn() };
}

function service(commercial: LLMClient, opensource: LLMClient) {
  return new TwoTierLLMService(commercial, opensource, {} as never, {} as never, {} as never);
}

const claude: LLMClientModelEntry = { id: 'claude-sonnet', name: 'Claude Sonnet', providerName: 'anthropic', modelType: 'text-generation', isLocal: false };
const qwen: LLMClientModelEntry = { id: 'qwen3.6:latest', name: 'qwen3.6:latest', providerName: 'ollama', modelType: 'text-generation', isLocal: true };

describe('TwoTierLLMService.listModels', () => {
  it('merges both tiers and marks the opensource tier local', async () => {
    const s = service(client('commercial', async () => [claude]), client('opensource', async () => [qwen]));
    await expect(s.listModels()).resolves.toEqual([
      expect.objectContaining({ id: 'claude-sonnet', providerName: 'anthropic', isLocal: false }),
      expect.objectContaining({ id: 'qwen3.6:latest', providerName: 'ollama', isLocal: true }),
    ]);
  });

  it('throws, naming the tier, when the opensource tier cannot list its models', async () => {
    const s = service(
      client('commercial', async () => [claude]),
      client('opensource', async () => { throw new Error('Cannot list local Ollama models: http://localhost:11434/api/tags did not answer'); }),
    );
    await expect(s.listModels()).rejects.toThrow(
      'Failed to list LLM models. opensource tier: Cannot list local Ollama models: http://localhost:11434/api/tags did not answer',
    );
  });

  it('names every tier that failed', async () => {
    const s = service(
      client('commercial', async () => { throw new Error('OpenRouter 401'); }),
      client('opensource', async () => { throw new Error('LM Studio down'); }),
    );
    await expect(s.listModels()).rejects.toThrow(
      'Failed to list LLM models. commercial tier: OpenRouter 401 opensource tier: LM Studio down',
    );
  });

  it('does not cache a failed listing', async () => {
    let ollamaUp = false;
    const opensource = client('opensource', async () => {
      if (!ollamaUp) throw new Error('Ollama down');
      return [qwen];
    });
    const s = service(client('commercial', async () => [claude]), opensource);
    await expect(s.listModels()).rejects.toThrow('opensource tier: Ollama down');
    ollamaUp = true;
    await expect(s.listModels()).resolves.toHaveLength(2);
  });
});

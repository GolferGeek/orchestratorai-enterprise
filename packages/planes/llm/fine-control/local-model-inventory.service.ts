import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { DATABASE_SERVICE, type DatabaseService } from '../../database';

export interface LocalModelInventory {
  /** Whether the Ollama host answered. */
  reachable: boolean;
  /** Models installed there (empty when unreachable). */
  installed: string[];
  /** Installed models that llm_models did not know, now added. */
  added: string[];
  /** Installed models that cannot chat or embed (e.g. decision models), kept out of llm_models. */
  skipped: string[];
}

interface OllamaTag {
  name: string;
  /** Reported by Ollama 0.35+: completion, embedding, decision, vision, tools, ... */
  capabilities?: string[];
}

/**
 * A model belongs in llm_models only if it can generate text or embeddings. Decision models
 * (clef, clef-flash) answer only /v1/systemone; offered as a chat model, every call fails.
 * Hosts too old to report capabilities keep the old behaviour: every model counts.
 */
function servesLlmCalls(tag: OllamaTag): boolean {
  return !tag.capabilities || tag.capabilities.includes('completion') || tag.capabilities.includes('embedding');
}

function modelTypeOf(tag: OllamaTag): 'embedding' | 'text-generation' {
  if (tag.capabilities) return tag.capabilities.includes('embedding') && !tag.capabilities.includes('completion') ? 'embedding' : 'text-generation';
  return tag.name.includes('embed') ? 'embedding' : 'text-generation';
}

/**
 * Keeps llm_models.is_available true for exactly the Ollama models the host
 * has installed, so a model choice can be checked before a call fails. Models
 * that cannot chat or embed are never added, and rows already there for them
 * are deactivated so no picker offers them.
 *
 * An unreachable host marks every local model unavailable (they cannot run),
 * and says so in the log; database errors are thrown.
 */
@Injectable()
export class LocalModelInventoryService {
  private readonly logger = new Logger(LocalModelInventoryService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('OLLAMA_BASE_URL').replace(/\/$/, '');
  }

  async sync(): Promise<LocalModelInventory> {
    let tags: OllamaTag[] = [];
    let reachable = true;
    try {
      const response = await firstValueFrom(
        this.http.get<{ models?: OllamaTag[] }>(`${this.baseUrl}/api/tags`, { timeout: 5000 }),
      );
      tags = response.data.models ?? [];
    } catch (error) {
      reachable = false;
      this.logger.error(
        `Ollama at ${this.baseUrl} is unreachable (${error instanceof Error ? error.message : String(error)}); every local model is marked unavailable`,
      );
    }

    const usable = tags.filter(servesLlmCalls);
    const installed = usable.map((tag) => tag.name);
    const skipped = tags.filter((tag) => !servesLlmCalls(tag)).map((tag) => tag.name);

    const added = await this.db.transaction(async (tx) => {
      const cleared = await tx
        .from(null, 'llm_models')
        .update({ is_available: false })
        .eq('provider_name', 'ollama');
      if (cleared.error) throw new Error(`Failed to reset local model availability: ${cleared.error.message}`);
      if (skipped.length > 0) {
        const retired = await tx
          .from(null, 'llm_models')
          .update({ is_active: false })
          .eq('provider_name', 'ollama')
          .in('model_name', skipped);
        if (retired.error) throw new Error(`Failed to deactivate non-chat local models: ${retired.error.message}`);
      }
      if (installed.length === 0) return [];

      const known = await tx
        .from(null, 'llm_models')
        .update({ is_available: true })
        .eq('provider_name', 'ollama')
        .in('model_name', installed)
        .select('model_name');
      if (known.error) throw new Error(`Failed to mark installed local models: ${known.error.message}`);
      const knownNames = new Set((known.data as Array<{ model_name: string }>).map((row) => row.model_name));

      const missing = usable.filter((tag) => !knownNames.has(tag.name));
      if (missing.length > 0) {
        const inserted = await tx.from(null, 'llm_models').insert(
          missing.map((tag) => ({
            model_name: tag.name,
            provider_name: 'ollama',
            // The service the model is reached through; llm_models.vendor is NOT NULL.
            vendor: 'ollama',
            display_name: tag.name,
            model_type: modelTypeOf(tag),
            is_local: true,
            is_active: true,
            is_available: true,
          })),
        );
        if (inserted.error) throw new Error(`Failed to add installed local models: ${inserted.error.message}`);
      }
      return missing.map((tag) => tag.name);
    });

    this.logger.log(
      reachable
        ? `Local models available: ${installed.join(', ') || 'none'}${added.length ? ` (added: ${added.join(', ')})` : ''}${skipped.length ? ` (not chat or embedding, skipped: ${skipped.join(', ')})` : ''}`
        : 'Local models unavailable: Ollama unreachable',
    );
    return { reachable, installed, added, skipped };
  }
}

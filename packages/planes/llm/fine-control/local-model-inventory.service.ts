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
}

/**
 * Keeps llm_models.is_available true for exactly the Ollama models the host
 * has installed, so a model choice can be checked before a call fails.
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
    let installed: string[] = [];
    let reachable = true;
    try {
      const response = await firstValueFrom(
        this.http.get<{ models?: Array<{ name: string }> }>(`${this.baseUrl}/api/tags`, { timeout: 5000 }),
      );
      installed = (response.data.models ?? []).map((model) => model.name);
    } catch (error) {
      reachable = false;
      this.logger.error(
        `Ollama at ${this.baseUrl} is unreachable (${error instanceof Error ? error.message : String(error)}); every local model is marked unavailable`,
      );
    }

    const added = await this.db.transaction(async (tx) => {
      const cleared = await tx
        .from(null, 'llm_models')
        .update({ is_available: false })
        .eq('provider_name', 'ollama');
      if (cleared.error) throw new Error(`Failed to reset local model availability: ${cleared.error.message}`);
      if (installed.length === 0) return [];

      const known = await tx
        .from(null, 'llm_models')
        .update({ is_available: true })
        .eq('provider_name', 'ollama')
        .in('model_name', installed)
        .select('model_name');
      if (known.error) throw new Error(`Failed to mark installed local models: ${known.error.message}`);
      const knownNames = new Set((known.data as Array<{ model_name: string }>).map((row) => row.model_name));

      const missing = installed.filter((name) => !knownNames.has(name));
      if (missing.length > 0) {
        const inserted = await tx.from(null, 'llm_models').insert(
          missing.map((name) => ({
            model_name: name,
            provider_name: 'ollama',
            // The service the model is reached through; llm_models.vendor is NOT NULL.
            vendor: 'ollama',
            display_name: name,
            model_type: name.includes('embed') ? 'embedding' : 'text-generation',
            is_local: true,
            is_active: true,
            is_available: true,
          })),
        );
        if (inserted.error) throw new Error(`Failed to add installed local models: ${inserted.error.message}`);
      }
      return missing;
    });

    this.logger.log(
      reachable
        ? `Local models available: ${installed.join(', ') || 'none'}${added.length ? ` (added: ${added.join(', ')})` : ''}`
        : 'Local models unavailable: Ollama unreachable',
    );
    return { reachable, installed, added };
  }
}

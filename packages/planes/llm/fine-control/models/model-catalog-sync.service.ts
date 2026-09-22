import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { OpenRouterClient } from '../../openrouter/openrouter.client';

/**
 * Keeps `llm_models` in step with OpenRouter's published catalog.
 *
 * Why this exists: the catalog used to be maintained by hand through the admin
 * "Add Model" form, which meant re-typing a list the vendor already publishes —
 * 444 models with pricing, context windows and modalities, changing weekly. It
 * had drifted to 28 rows, every one Ollama, so the model picker offered no
 * commercial model at all.
 *
 * Two separate facts about every model, deliberately kept apart:
 *
 *   - `provider_name` is the SERVICE we route through. For everything this
 *     sync writes that is `openrouter`. It is what ExecutionContext.provider
 *     carries, what LLMServiceFactory switches on, and what llm_usage records.
 *   - `vendor` is WHO MADE the model — anthropic, openai, google. It is what
 *     the "pick your provider" dropdown groups by, and it comes free in the
 *     OpenRouter id.
 *
 * So a model shows as Anthropic to the user and goes out as OpenRouter in the
 * ledger, and both are true. Routing never has to guess from the shape of an
 * id, because the service is recorded rather than inferred.
 *
 * The allow-list is `OPENROUTER_AUTO_ALLOWED_MODELS`, applied by the client, so
 * the catalog only ever contains models this deployment permits.
 */
@Injectable()
export class ModelCatalogSyncService {
  private readonly logger = new Logger(ModelCatalogSyncService.name);

  /** Vendors whose display name is not just the slug title-cased. */
  private readonly vendorDisplayNames: Record<string, string> = {
    openai: 'OpenAI',
    xai: 'xAI',
    ai21: 'AI21',
    deepseek: 'DeepSeek',
    mistralai: 'Mistral AI',
    meta: 'Meta',
    'meta-llama': 'Meta',
    nvidia: 'NVIDIA',
    openrouter: 'OpenRouter',
  };

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly client: OpenRouterClient,
  ) {}

  /**
   * Pull the allowed catalog and upsert it.
   *
   * Returns counts rather than throwing on an empty result: an external
   * catalog that momentarily returns nothing should not wipe the picker.
   */
  async sync(): Promise<{
    models: number;
    vendors: string[];
    deactivated: number;
  }> {
    this.client.assertConfigured();

    const entries = await this.client.listModels();
    const allowed = this.applyAllowList(entries);

    if (allowed.length === 0) {
      // Refuse to act on an empty catalog rather than deactivating every row.
      // An empty answer from the vendor is far more likely to be their problem
      // than a genuine instruction to offer no models.
      throw new Error(
        'OpenRouter returned no models matching OPENROUTER_AUTO_ALLOWED_MODELS. ' +
          'Refusing to sync, because emptying the catalog would leave the model ' +
          'picker blank.',
      );
    }

    const vendors = [...new Set(allowed.map((m) => this.vendorOf(m.id)))].sort();

    await this.upsertModels(allowed);
    const deactivated = await this.deactivateWithdrawn(allowed.map((m) => m.id));

    this.logger.log(
      `Model catalog synced via openrouter: ${allowed.length} models across ${vendors.length} vendors (${vendors.join(', ')})` +
        (deactivated > 0 ? `, ${deactivated} withdrawn` : ''),
    );

    return { models: allowed.length, vendors, deactivated };
  }

  // ===================== Internals =====================

  /**
   * The vendor is the part before the first slash — that is what makes an
   * OpenRouter id self-describing, and why routing needs nothing but the id.
   */
  private vendorOf(modelId: string): string {
    const slash = modelId.indexOf('/');
    return slash > 0 ? modelId.slice(0, slash).toLowerCase() : 'openrouter';
  }

  private displayNameFor(vendor: string): string {
    return (
      this.vendorDisplayNames[vendor] ??
      vendor.charAt(0).toUpperCase() + vendor.slice(1)
    );
  }

  private applyAllowList(
    entries: Array<{ id: string }>,
  ): Array<Record<string, unknown> & { id: string }> {
    const patterns = this.allowedPatterns();
    const matches = (id: string) =>
      patterns.length === 0 || patterns.some((p) => p.test(id));
    return entries.filter((e) =>
      matches(e.id),
    ) as Array<Record<string, unknown> & { id: string }>;
  }

  /**
   * Same patterns the Auto Router uses, so the picker and the router cannot
   * disagree about what this deployment is allowed to call.
   */
  private allowedPatterns(): RegExp[] {
    const raw = process.env.OPENROUTER_AUTO_ALLOWED_MODELS;
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(
        'OPENROUTER_AUTO_ALLOWED_MODELS must be a JSON array of model patterns',
      );
    }

    return parsed.map(
      (pattern) =>
        new RegExp(
          `^${String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
          'i',
        ),
    );
  }

  private async upsertModels(
    entries: Array<Record<string, unknown> & { id: string }>,
  ): Promise<void> {
    for (const entry of entries) {
      const architecture = entry.architecture as
        | { output_modalities?: string[]; input_modalities?: string[] }
        | undefined;
      const outputs = architecture?.output_modalities ?? [];
      const pricing = entry.pricing as
        | { prompt?: string; completion?: string }
        | undefined;

      const { error } = (await this.db
        .from(null, 'llm_models')
        .upsert(
          {
            model_name: entry.id,
            // The SERVICE we route through — always openrouter for this sync.
            provider_name: 'openrouter',
            // WHO MADE IT — what the picker groups by.
            vendor: this.vendorOf(entry.id),
            display_name: (entry.name as string) ?? entry.id,
            model_type: outputs.includes('image')
              ? 'image-generation'
              : outputs.includes('video')
                ? 'video-generation'
                : 'text-generation',
            context_window: (entry.context_length as number) ?? null,
            max_output_tokens:
              (
                entry.top_provider as
                  | { max_completion_tokens?: number }
                  | undefined
              )?.max_completion_tokens ?? null,
            // OpenRouter quotes per-token; the rest of the platform works in
            // per-1k, so convert once here rather than at every read.
            pricing_info_json: {
              input_per_1k: this.perThousand(pricing?.prompt),
              output_per_1k: this.perThousand(pricing?.completion),
              source: 'openrouter',
            },
            capabilities: architecture?.input_modalities ?? [],
            is_local: false,
            is_active: true,
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'model_name' },
        )) as QueryResult<unknown>;

      if (error) {
        throw new Error(`Failed to upsert model ${entry.id}: ${error.message}`);
      }
    }
  }

  private perThousand(perToken: string | undefined): number | null {
    if (perToken === undefined) return null;
    const value = Number(perToken);
    return Number.isFinite(value) ? value * 1000 : null;
  }

  /**
   * Models the vendor has withdrawn, or that the allow-list no longer covers,
   * are deactivated rather than deleted — `llm_usage` rows reference them by
   * name and history should stay readable.
   */
  private async deactivateWithdrawn(currentIds: string[]): Promise<number> {
    const { data, error } = (await this.db
      .from(null, 'llm_models')
      .select('model_name')
      .eq('is_active', true)
      .eq('is_local', false)) as QueryResult<Array<{ model_name: string }>>;

    if (error) {
      throw new Error(`Failed to read existing models: ${error.message}`);
    }

    const current = new Set(currentIds);
    const stale = (data ?? [])
      .map((row) => row.model_name)
      .filter((name) => !current.has(name));

    for (const name of stale) {
      await this.db
        .from(null, 'llm_models')
        .update({
          is_active: false,
          deprecated_at: new Date().toISOString(),
          deprecation_reason:
            'No longer offered by OpenRouter, or outside OPENROUTER_AUTO_ALLOWED_MODELS',
          updated_at: new Date().toISOString(),
        })
        .eq('model_name', name);
    }

    return stale.length;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  OpenRouterClient,
  type OpenRouterVideoModelEntry,
} from '../../openrouter/openrouter.client';

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
    // Video models come from OpenRouter's video catalog, which says what each
    // one accepts and what it costs per second. The general catalog lists
    // some video models the video API no longer serves (Sora 2 Pro answered
    // 404), so a video model it lists is never taken from there.
    const videoModels = this.client.isVideoEnabled()
      ? await this.client.listVideoModels()
      : [];

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

    const ids = [...allowed.map((m) => m.id), ...videoModels.map((m) => m.id)];
    const vendors = [...new Set(ids.map((id) => this.vendorOf(id)))].sort();

    await this.upsertModels(allowed);
    await this.upsertVideoModels(videoModels);
    const deactivated = await this.deactivateWithdrawn(ids);

    this.logger.log(
      `Model catalog synced via openrouter: ${ids.length} models across ${vendors.length} vendors (${vendors.join(', ')})` +
        (deactivated > 0 ? `, ${deactivated} withdrawn` : ''),
    );

    return { models: ids.length, vendors, deactivated };
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

  /**
   * Text models: the Auto Router's allow-list. Image models: every one
   * OpenRouter publishes, because the router never picks them (it routes
   * chat), and the media agents choose their model from this catalog
   * (FLUX, Recraft, Seedream and the rest are not on the text allow-list).
   * Video models are left out here; they come from the video catalog.
   */
  private applyAllowList(
    entries: Array<{ id: string; architecture?: { output_modalities?: string[] } }>,
  ): Array<Record<string, unknown> & { id: string }> {
    const patterns = this.allowedPatterns();
    const matches = (id: string) =>
      patterns.length === 0 || patterns.some((p) => p.test(id));
    const outputs = (e: { architecture?: { output_modalities?: string[] } }) =>
      e.architecture?.output_modalities ?? [];
    return entries.filter((e) => {
      if (outputs(e).includes('video') && !outputs(e).includes('image')) return false;
      return matches(e.id) || outputs(e).includes('image');
    }) as Array<Record<string, unknown> & { id: string }>;
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
        | { prompt?: string; completion?: string; image?: string }
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
              ...(pricing?.image !== undefined && Number(pricing.image) > 0
                ? { per_image: Number(pricing.image) }
                : {}),
              source: 'openrouter',
            },
            capabilities: architecture?.input_modalities ?? [],
            is_local: false,
            is_active: true,
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          // The table's natural key: the same model can legitimately exist
          // twice, once per service that can reach it.
          { onConflict: 'model_name,provider_name' },
        )) as QueryResult<unknown>;

      if (error) {
        throw new Error(`Failed to upsert model ${entry.id}: ${error.message}`);
      }
    }
  }

  /**
   * Video models, with what each accepts (model_parameters_json.video) and
   * its price per second: the cheapest of its duration_seconds SKUs, so the
   * picker can say "from $x a second". The full SKU list is kept beside it.
   */
  private async upsertVideoModels(entries: OpenRouterVideoModelEntry[]): Promise<void> {
    for (const entry of entries) {
      const skus = entry.pricing_skus ?? {};
      const perSecond = Object.entries(skus)
        .filter(([sku]) => sku.startsWith('duration_seconds'))
        .map(([, price]) => Number(price))
        .filter((price) => Number.isFinite(price) && price > 0);
      const { error } = (await this.db
        .from(null, 'llm_models')
        .upsert(
          {
            model_name: entry.id,
            provider_name: 'openrouter',
            vendor: this.vendorOf(entry.id),
            display_name: entry.name ?? entry.id,
            model_type: 'video-generation',
            context_window: null,
            max_output_tokens: null,
            model_parameters_json: {
              video: {
                durations: entry.supported_durations ?? [],
                resolutions: entry.supported_resolutions ?? [],
                aspectRatios: entry.supported_aspect_ratios ?? [],
                generateAudio: entry.generate_audio === true,
              },
            },
            pricing_info_json: {
              input_per_1k: 0,
              output_per_1k: 0,
              ...(perSecond.length > 0 ? { per_second: Math.min(...perSecond) } : {}),
              video_skus: skus,
              source: 'openrouter',
            },
            capabilities: ['text', ...((entry.supported_frame_images ?? []).length > 0 ? ['image'] : [])],
            is_local: false,
            is_active: true,
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'model_name,provider_name' },
        )) as QueryResult<unknown>;

      if (error) {
        throw new Error(`Failed to upsert video model ${entry.id}: ${error.message}`);
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
    // Scoped to this service: deactivating on model_name alone would also
    // retire the same model reached directly from its vendor.
    const { data, error } = (await this.db
      .from(null, 'llm_models')
      .select('model_name')
      .eq('is_active', true)
      .eq('provider_name', 'openrouter')) as QueryResult<
      Array<{ model_name: string }>
    >;

    if (error) {
      throw new Error(`Failed to read existing models: ${error.message}`);
    }

    const current = new Set(currentIds);
    const stale = (data ?? [])
      .map((row) => row.model_name)
      .filter((name) => !current.has(name));

    for (const name of stale) {
      const { error: updateError } = (await this.db
        .from(null, 'llm_models')
        .update({
          is_active: false,
          deprecated_at: new Date().toISOString(),
          deprecation_reason:
            'No longer offered by OpenRouter, or outside OPENROUTER_AUTO_ALLOWED_MODELS',
          updated_at: new Date().toISOString(),
        })
        .eq('model_name', name)
        .eq('provider_name', 'openrouter')) as QueryResult<unknown>;
      if (updateError) {
        throw new Error(`Failed to deactivate model ${name}: ${updateError.message}`);
      }
    }

    return stale.length;
  }
}

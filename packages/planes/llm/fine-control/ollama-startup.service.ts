import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaDiscoveryService } from './ollama-discovery.service';
import {
  LocalModelStatusService,
  ModelStatus,
} from './local-model-status.service';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { getTableName } from '@orchestratorai/planes/database';
import { LocalModelInventoryService, type LocalModelInventory } from './local-model-inventory.service';

export interface StartupSyncResult {
  success: boolean;
  ollamaUrl: string | null;
  ollamaVersion?: string;
  models: string[];
  globalConfig: {
    provider: string;
    model: string;
  };
  warnings: string[];
}

/**
 * Model RAM requirements for recommendations.
 */
export interface ModelRecommendation {
  name: string;
  sizeGB: number;
  minRamGB: number;
  tier: 'economy' | 'standard' | 'premium' | 'cloud';
  description: string;
  isInstalled?: boolean;
  isRecommended?: boolean;
}

const MODEL_RAM_REQUIREMENTS: ModelRecommendation[] = [
  {
    name: 'llama3.2:1b',
    sizeGB: 1.3,
    minRamGB: 8,
    tier: 'economy',
    description: 'Fast responses, simple tasks',
  },
  {
    name: 'llama3.2:3b',
    sizeGB: 2.0,
    minRamGB: 16,
    tier: 'standard',
    description: 'General purpose, balanced',
  },
  {
    name: 'qwen3:8b',
    sizeGB: 4.7,
    minRamGB: 32,
    tier: 'standard',
    description: 'Code generation, reasoning',
  },
  {
    name: 'qwen3:14b',
    sizeGB: 8.9,
    minRamGB: 48,
    tier: 'premium',
    description: 'Complex tasks, better quality',
  },
  {
    name: 'qwen3-coder:30b',
    sizeGB: 18,
    minRamGB: 64,
    tier: 'premium',
    description: 'Specialized code generation, large context',
  },
  {
    name: 'deepseek-r1:32b',
    sizeGB: 19,
    minRamGB: 64,
    tier: 'premium',
    description: 'Advanced reasoning',
  },
  {
    name: 'deepseek-r1:70b',
    sizeGB: 40,
    minRamGB: 96,
    tier: 'cloud',
    description: 'Maximum capability',
  },
];

/**
 * Service that syncs Ollama models with the database on API startup.
 *
 * Features:
 * - Uses discovery service with retry logic
 * - On success: syncs models with database
 * - On failure: logs warning and continues gracefully
 * - Updates global config if current model unavailable
 * - Logs summary of available models and default
 */
@Injectable()
export class OllamaStartupService implements OnModuleInit {
  private readonly logger = new Logger(OllamaStartupService.name);

  constructor(
    private readonly discoveryService: OllamaDiscoveryService,
    private readonly localModelStatusService: LocalModelStatusService,
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly inventory: LocalModelInventoryService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Local models only exist for the fine_control LLM plane.
    const llmProvider = this.configService.get<string>('LLM_PROVIDER');
    if (llmProvider && llmProvider !== 'fine_control') {
      this.logger.log(`No local model inventory (LLM_PROVIDER=${llmProvider})`);
      return;
    }
    await this.inventory.sync();
  }

  /**
   * Perform the startup sync process.
   */
  async performStartupSync(): Promise<StartupSyncResult> {
    const warnings: string[] = [];

    // Step 1: Discover Ollama
    this.logger.debug('[SYNC] Step 1: Starting Ollama discovery...');
    const discovery = await this.discoveryService.discover();
    this.logger.debug(
      `[SYNC] Step 1 complete: connected=${discovery.connected}`,
    );

    if (!discovery.connected) {
      this.logger.warn(
        `Ollama not available: ${discovery.error}. Local models will be unavailable.`,
      );
      return {
        success: false,
        ollamaUrl: null,
        models: [],
        globalConfig: await this.getGlobalConfig(),
        warnings: [`Ollama not available: ${discovery.error}`],
      };
    }

    this.logger.log(
      `Ollama connected at ${discovery.url} (v${discovery.version || 'unknown'})`,
    );

    // Step 2: Get available models from Ollama (fast - no health checks)
    this.logger.debug('[SYNC] Step 2: Getting available models...');
    const ollamaModels = await this.localModelStatusService.getLoadedModels();
    this.logger.debug(`[SYNC] Step 2 complete: ${ollamaModels.length} models`);
    const modelNames = ollamaModels.map((m) => m.name);

    this.logger.log(`Available models: ${modelNames.join(', ') || 'none'}`);

    // Skip database sync at startup - models are synced on-demand when needed
    // This dramatically speeds up API startup time
    this.logger.debug(
      '[SYNC] Startup sync complete (database sync skipped for speed)',
    );

    return {
      success: true,
      ollamaUrl: discovery.url,
      ollamaVersion: discovery.version,
      models: modelNames,
      globalConfig: {
        provider: 'ollama',
        model: modelNames[0] || 'llama3.2:1b',
      },
      warnings,
    };
  }

  /**
   * Get priority for a model based on its name.
   */
  private getPriorityForModel(modelName: string): number {
    // Higher priority for smaller, faster models
    if (modelName.includes(':1b')) return 10;
    if (modelName.includes(':3b')) return 8;
    if (modelName.includes(':8b')) return 6;
    if (modelName.includes(':14b')) return 4;
    if (modelName.includes(':32b')) return 2;
    if (modelName.includes(':70b')) return 1;
    return 5;
  }

  /**
   * Select the best available model for default use.
   * Prefers smaller, faster models for responsiveness.
   */
  private selectBestAvailableModel(models: string[]): string {
    // Priority order: prefer smaller models for default
    const priorities = [
      'llama3.2:1b',
      'llama3.2:3b',
      'llama3.2:latest',
      'qwen3:8b',
      'qwen3:14b',
    ];

    for (const preferred of priorities) {
      if (models.includes(preferred)) {
        return preferred;
      }
    }

    // Return first available model (or default if none)
    return models[0] || 'llama3.2:1b';
  }

  /**
   * Get current global model configuration.
   */
  async getGlobalConfig(): Promise<{ provider: string; model: string }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data: rawData, error } = await this.db.rpc(
        'get_global_model_config',
      );

      if (error || !rawData) {
        return {
          provider: process.env.DEFAULT_LLM_PROVIDER || 'ollama',
          model: process.env.DEFAULT_LLM_MODEL || 'llama3.2:1b',
        };
      }

      // SQL Server rpc returns recordset array; Supabase returns scalar directly
      let configValue: unknown = rawData;
      if (Array.isArray(rawData) && rawData.length > 0) {
        const firstRow = rawData[0] as Record<string, unknown>;
        const values = Object.values(firstRow);
        if (values.length === 1) configValue = values[0];
      }
      const parsed =
        typeof configValue === 'string'
          ? (JSON.parse(configValue) as Record<string, unknown>)
          : configValue;
      const config = parsed as { provider?: string; model?: string };

      return {
        provider: config.provider || 'ollama',
        model: config.model || 'llama3.2:1b',
      };
    } catch {
      return {
        provider: process.env.DEFAULT_LLM_PROVIDER || 'ollama',
        model: process.env.DEFAULT_LLM_MODEL || 'llama3.2:1b',
      };
    }
  }

  /**
   * Update global model configuration.
   */
  async updateGlobalConfig(modelName: string): Promise<void> {
    try {
      await this.db.from(null, getTableName('system_settings')).upsert(
        {
          key: 'model_config_global',
          value: {
            provider: 'ollama',
            model: modelName,
            parameters: {
              temperature: 0.7,
              maxTokens: 8000,
            },
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
    } catch (error) {
      this.logger.error('Failed to update global config:', error);
    }
  }

  /**
   * Get recommended models for a given RAM size.
   */
  getRecommendedModelsForRAM(ramGB: number): ModelRecommendation[] {
    return MODEL_RAM_REQUIREMENTS.filter((m) => ramGB >= m.minRamGB).map(
      (m) => ({
        ...m,
        isRecommended: true,
      }),
    );
  }

  /**
   * Get all model RAM requirements.
   */
  getAllModelRequirements(): ModelRecommendation[] {
    return MODEL_RAM_REQUIREMENTS;
  }

  /**
   * Trigger a manual sync.
   */
  /** Re-read which local models the Ollama host has (POST /llm/sync-models). */
  async triggerSync(): Promise<LocalModelInventory> {
    return this.inventory.sync();
  }
}

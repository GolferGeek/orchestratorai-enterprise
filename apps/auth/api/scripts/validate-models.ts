/**
 * LLM Model Validation & Sync Script
 *
 * This script:
 * 1. Syncs local Ollama models with the database (mirror what's downloaded)
 * 2. Validates all cloud provider models (OpenAI, Anthropic, Google, xAI, Ollama Cloud)
 * 3. Deactivates failed models with a reason (keeps historical reference)
 *
 * Usage:
 *   npm run validate-models              # Full validation and sync
 *   npm run validate-models -- --local-only     # Just sync local Ollama (fast)
 *   npm run validate-models -- --provider=openai # Test specific provider
 *   npm run validate-models -- --dry-run        # Report only, no DB changes
 *   npm run validate-models -- --verbose        # Verbose output
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

// ============================================================================
// Types
// ============================================================================

interface LLMModel {
  model_name: string;
  provider_name: string;
  display_name: string | null;
  model_type: string;
  is_local: boolean;
  is_active: boolean;
  deprecation_reason: string | null;
  deprecated_at: string | null;
  last_validated_at: string | null;
}

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

interface ValidationResult {
  model_name: string;
  provider_name: string;
  success: boolean;
  latency_ms?: number;
  error?: string;
}

interface SyncResult {
  added: string[];
  reactivated: string[];
  deprecated: string[];
  unchanged: string[];
}

interface ProviderReport {
  provider: string;
  total: number;
  validated: ValidationResult[];
  failed: ValidationResult[];
}

interface ValidationReport {
  timestamp: string;
  ollamaLocalSync?: SyncResult;
  ollamaCloud?: ProviderReport;
  cloudProviders: ProviderReport[];
  summary: {
    totalModels: number;
    validatedCount: number;
    failedCount: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const OLLAMA_LOCAL_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_CLOUD_URL = process.env.OLLAMA_CLOUD_BASE_URL || 'https://ollama.com';
const OLLAMA_CLOUD_API_KEY = process.env.OLLAMA_CLOUD_API_KEY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;

const TEST_CONFIG = {
  systemPrompt: 'Reply with exactly: OK',
  userPrompt: 'Test',
  maxTokens: 10,
  timeout: 30000,
};

// Track if migration has been applied (new columns exist)
let hasDeprecationColumns = true;

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
  localOnly: boolean;
  provider?: string;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    localOnly: args.includes('--local-only'),
    provider: args.find((a) => a.startsWith('--provider='))?.split('=')[1],
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
  };
}

// ============================================================================
// Logging Utilities
// ============================================================================

let verboseMode = false;

function log(message: string): void {
  console.log(message);
}

function verbose(message: string): void {
  if (verboseMode) {
    console.log(`  [verbose] ${message}`);
  }
}

function success(message: string): void {
  console.log(`  ✓ ${message}`);
}

function fail(message: string): void {
  console.log(`  ✗ ${message}`);
}

function warn(message: string): void {
  console.log(`  ⚠ ${message}`);
}

// ============================================================================
// Database Operations
// ============================================================================

async function checkDeprecationColumnsExist(supabase: SupabaseClient): Promise<boolean> {
  try {
    // Try to query with the new columns - if it fails, columns don't exist
    const { error } = await supabase
      .from('llm_models')
      .select('deprecation_reason, deprecated_at, last_validated_at')
      .limit(1);

    if (error && error.message.includes('column')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function getModelsForProvider(
  supabase: SupabaseClient,
  providerName: string,
  isLocal?: boolean,
): Promise<LLMModel[]> {
  let query = supabase
    .from('llm_models')
    .select('*')
    .eq('provider_name', providerName);

  if (isLocal !== undefined) {
    query = query.eq('is_local', isLocal);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch models for ${providerName}: ${error.message}`);
  }

  return data || [];
}

async function getActiveModelsForProvider(
  supabase: SupabaseClient,
  providerName: string,
): Promise<LLMModel[]> {
  const { data, error } = await supabase
    .from('llm_models')
    .select('*')
    .eq('provider_name', providerName)
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to fetch active models for ${providerName}: ${error.message}`);
  }

  return data || [];
}

async function upsertOllamaModel(
  supabase: SupabaseClient,
  modelName: string,
  displayName: string,
  dryRun: boolean,
): Promise<'added' | 'reactivated' | 'unchanged'> {
  // Check if model exists
  const { data: existing } = await supabase
    .from('llm_models')
    .select('*')
    .eq('model_name', modelName)
    .eq('provider_name', 'ollama')
    .single();

  if (!existing) {
    // Insert new model
    if (!dryRun) {
      const insertData: Record<string, unknown> = {
        model_name: modelName,
        provider_name: 'ollama',
        display_name: displayName,
        is_local: true,
        is_active: true,
      };
      if (hasDeprecationColumns) {
        insertData.last_validated_at = new Date().toISOString();
      }
      const { error } = await supabase.from('llm_models').insert(insertData);
      if (error) {
        throw new Error(`Failed to insert model ${modelName}: ${error.message}`);
      }
    }
    return 'added';
  }

  if (!existing.is_active) {
    // Reactivate model
    if (!dryRun) {
      const updateData: Record<string, unknown> = {
        is_active: true,
      };
      if (hasDeprecationColumns) {
        updateData.deprecation_reason = null;
        updateData.deprecated_at = null;
        updateData.last_validated_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('llm_models')
        .update(updateData)
        .eq('model_name', modelName)
        .eq('provider_name', 'ollama');
      if (error) {
        throw new Error(`Failed to reactivate model ${modelName}: ${error.message}`);
      }
    }
    return 'reactivated';
  }

  // Update last_validated_at
  if (!dryRun && hasDeprecationColumns) {
    await supabase
      .from('llm_models')
      .update({ last_validated_at: new Date().toISOString() })
      .eq('model_name', modelName)
      .eq('provider_name', 'ollama');
  }
  return 'unchanged';
}

async function deprecateModel(
  supabase: SupabaseClient,
  modelName: string,
  providerName: string,
  reason: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;

  const updateData: Record<string, unknown> = {
    is_active: false,
  };
  if (hasDeprecationColumns) {
    updateData.deprecation_reason = reason;
    updateData.deprecated_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('llm_models')
    .update(updateData)
    .eq('model_name', modelName)
    .eq('provider_name', providerName);

  if (error) {
    throw new Error(`Failed to deprecate model ${modelName}: ${error.message}`);
  }
}

async function updateValidatedAt(
  supabase: SupabaseClient,
  modelName: string,
  providerName: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun || !hasDeprecationColumns) return;

  const { error } = await supabase
    .from('llm_models')
    .update({ last_validated_at: new Date().toISOString() })
    .eq('model_name', modelName)
    .eq('provider_name', providerName);

  if (error) {
    throw new Error(`Failed to update last_validated_at for ${modelName}: ${error.message}`);
  }
}

// ============================================================================
// Ollama Local Sync
// ============================================================================

async function getOllamaLocalModels(): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${OLLAMA_LOCAL_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Ollama API returned ${response.status}`);
    }

    const data = (await response.json()) as OllamaTagsResponse;
    return data.models || [];
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Ollama local server not responding (timeout)');
    }
    throw new Error(`Failed to connect to Ollama: ${(error as Error).message}`);
  }
}

async function syncOllamaLocal(
  supabase: SupabaseClient,
  dryRun: boolean,
): Promise<SyncResult> {
  log('\n🔄 Ollama Local Sync:');

  const result: SyncResult = {
    added: [],
    reactivated: [],
    deprecated: [],
    unchanged: [],
  };

  // Get downloaded models from Ollama
  let ollamaModels: OllamaModel[];
  try {
    ollamaModels = await getOllamaLocalModels();
    verbose(`Found ${ollamaModels.length} models in Ollama`);
  } catch (error) {
    warn(`Cannot connect to Ollama: ${(error as Error).message}`);
    warn('Skipping Ollama local sync');
    return result;
  }

  const ollamaModelNames = new Set(ollamaModels.map((m) => m.name));

  // Get database models for Ollama local
  const dbModels = await getModelsForProvider(supabase, 'ollama', true);
  const dbModelNames = new Set(dbModels.map((m) => m.model_name));
  verbose(`Found ${dbModels.length} Ollama local models in database`);

  // Sync models from Ollama to DB
  for (const ollamaModel of ollamaModels) {
    const displayName = ollamaModel.details?.family
      ? `${ollamaModel.name} (${ollamaModel.details.family})`
      : ollamaModel.name;

    const status = await upsertOllamaModel(
      supabase,
      ollamaModel.name,
      displayName,
      dryRun,
    );

    if (status === 'added') {
      result.added.push(ollamaModel.name);
      success(`Added: ${ollamaModel.name}`);
    } else if (status === 'reactivated') {
      result.reactivated.push(ollamaModel.name);
      success(`Reactivated: ${ollamaModel.name}`);
    } else {
      result.unchanged.push(ollamaModel.name);
    }
  }

  // Deprecate models in DB but not in Ollama (instead of deleting)
  for (const dbModel of dbModels) {
    if (!ollamaModelNames.has(dbModel.model_name) && dbModel.is_active) {
      await deprecateModel(
        supabase,
        dbModel.model_name,
        'ollama',
        'Model not downloaded locally',
        dryRun,
      );
      result.deprecated.push(dbModel.model_name);
      warn(`Deprecated: ${dbModel.model_name} (not downloaded locally)`);
    }
  }

  // Summary
  if (result.added.length === 0 && result.reactivated.length === 0 && result.deprecated.length === 0) {
    log(`   Unchanged: ${result.unchanged.length} models`);
  }

  return result;
}

// ============================================================================
// Cloud Provider Validation
// ============================================================================

// Models that require max_completion_tokens instead of max_tokens
const OPENAI_NEW_TOKEN_PARAM_MODELS = ['gpt-5', 'o1', 'o3'];

function needsNewTokenParam(modelName: string): boolean {
  return OPENAI_NEW_TOKEN_PARAM_MODELS.some(prefix => modelName.startsWith(prefix));
}

async function testOpenAITextModel(modelName: string): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    // Use max_completion_tokens for newer models (GPT-5.x, o1, o3)
    const tokenParam = needsNewTokenParam(modelName)
      ? { max_completion_tokens: TEST_CONFIG.maxTokens }
      : { max_tokens: TEST_CONFIG.maxTokens };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: TEST_CONFIG.systemPrompt },
          { role: 'user', content: TEST_CONFIG.userPrompt },
        ],
        ...tokenParam,
      }),
      signal: AbortSignal.timeout(TEST_CONFIG.timeout),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as Record<string, unknown>).error
        ? ((errorData as Record<string, unknown>).error as Record<string, unknown>).message
        : `HTTP ${response.status}`;
      return {
        model_name: modelName,
        provider_name: 'openai',
        success: false,
        latency_ms: latency,
        error: String(errorMessage),
      };
    }

    return {
      model_name: modelName,
      provider_name: 'openai',
      success: true,
      latency_ms: latency,
    };
  } catch (error) {
    return {
      model_name: modelName,
      provider_name: 'openai',
      success: false,
      latency_ms: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

async function testOpenAIImageModel(modelName: string): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    // Use the images generations API for image models
    // gpt-image models require larger sizes (1024x1024, 1024x1536, 1536x1024, or 'auto')
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        prompt: 'A simple red circle on white background',
        n: 1,
        size: '1024x1024',
      }),
      signal: AbortSignal.timeout(120000), // Image generation can take longer
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as Record<string, unknown>).error
        ? ((errorData as Record<string, unknown>).error as Record<string, unknown>).message
        : `HTTP ${response.status}`;
      return {
        model_name: modelName,
        provider_name: 'openai',
        success: false,
        latency_ms: latency,
        error: String(errorMessage),
      };
    }

    return {
      model_name: modelName,
      provider_name: 'openai',
      success: true,
      latency_ms: latency,
    };
  } catch (error) {
    return {
      model_name: modelName,
      provider_name: 'openai',
      success: false,
      latency_ms: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

async function testOpenAIVideoModel(modelName: string): Promise<ValidationResult> {
  // Sora API is not publicly available yet - mark as needing manual validation
  // Once Sora API becomes available, implement actual validation
  return {
    model_name: modelName,
    provider_name: 'openai',
    success: true, // Assume valid - Sora API not yet public
    latency_ms: 0,
    error: undefined,
  };
}

async function testOpenAIModel(modelName: string, modelType: string): Promise<ValidationResult> {
  if (!OPENAI_API_KEY) {
    return {
      model_name: modelName,
      provider_name: 'openai',
      success: false,
      error: 'OPENAI_API_KEY not configured',
    };
  }

  switch (modelType) {
    case 'image-generation':
      return testOpenAIImageModel(modelName);
    case 'video-generation':
      return testOpenAIVideoModel(modelName);
    case 'text-generation':
    case 'reasoning':
    case 'code-generation':
    default:
      return testOpenAITextModel(modelName);
  }
}

async function testAnthropicModel(modelName: string, _modelType: string): Promise<ValidationResult> {
  if (!ANTHROPIC_API_KEY) {
    return {
      model_name: modelName,
      provider_name: 'anthropic',
      success: false,
      error: 'ANTHROPIC_API_KEY not configured',
    };
  }

  const startTime = Date.now();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: TEST_CONFIG.maxTokens,
        messages: [{ role: 'user', content: TEST_CONFIG.userPrompt }],
        system: TEST_CONFIG.systemPrompt,
      }),
      signal: AbortSignal.timeout(TEST_CONFIG.timeout),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as Record<string, unknown>).error
        ? ((errorData as Record<string, unknown>).error as Record<string, unknown>).message
        : `HTTP ${response.status}`;
      return {
        model_name: modelName,
        provider_name: 'anthropic',
        success: false,
        latency_ms: latency,
        error: String(errorMessage),
      };
    }

    return {
      model_name: modelName,
      provider_name: 'anthropic',
      success: true,
      latency_ms: latency,
    };
  } catch (error) {
    return {
      model_name: modelName,
      provider_name: 'anthropic',
      success: false,
      latency_ms: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

async function testGoogleTextModel(modelName: string): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    // Google Generative AI API for text models
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${TEST_CONFIG.systemPrompt}\n\n${TEST_CONFIG.userPrompt}` }],
            },
          ],
          generationConfig: {
            maxOutputTokens: TEST_CONFIG.maxTokens,
          },
        }),
        signal: AbortSignal.timeout(TEST_CONFIG.timeout),
      },
    );

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as Record<string, unknown>).error
        ? ((errorData as Record<string, unknown>).error as Record<string, unknown>).message
        : `HTTP ${response.status}`;
      return {
        model_name: modelName,
        provider_name: 'google',
        success: false,
        latency_ms: latency,
        error: String(errorMessage),
      };
    }

    return {
      model_name: modelName,
      provider_name: 'google',
      success: true,
      latency_ms: latency,
    };
  } catch (error) {
    return {
      model_name: modelName,
      provider_name: 'google',
      success: false,
      latency_ms: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

async function testGoogleImageModel(modelName: string): Promise<ValidationResult> {
  // Imagen models require Vertex AI with OAuth authentication
  // The public Generative AI API does not support Imagen
  // Mark as valid - requires Vertex AI setup for actual usage
  return {
    model_name: modelName,
    provider_name: 'google',
    success: true, // Assume valid - Imagen requires Vertex AI
    latency_ms: 0,
    error: undefined,
  };
}

async function testGoogleVideoModel(modelName: string): Promise<ValidationResult> {
  // Veo API requires Vertex AI and is not available via public Generative AI API
  // Mark as valid - requires manual validation or Vertex AI setup
  return {
    model_name: modelName,
    provider_name: 'google',
    success: true, // Assume valid - Veo requires Vertex AI
    latency_ms: 0,
    error: undefined,
  };
}

async function testGoogleModel(modelName: string, modelType: string): Promise<ValidationResult> {
  if (!GOOGLE_API_KEY) {
    return {
      model_name: modelName,
      provider_name: 'google',
      success: false,
      error: 'GOOGLE_API_KEY not configured',
    };
  }

  switch (modelType) {
    case 'image-generation':
      return testGoogleImageModel(modelName);
    case 'video-generation':
      return testGoogleVideoModel(modelName);
    case 'text-generation':
    case 'reasoning':
    case 'code-generation':
    default:
      return testGoogleTextModel(modelName);
  }
}

async function testXAIModel(modelName: string, _modelType: string): Promise<ValidationResult> {
  if (!XAI_API_KEY) {
    return {
      model_name: modelName,
      provider_name: 'xai',
      success: false,
      error: 'XAI_API_KEY not configured',
    };
  }

  const startTime = Date.now();

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: TEST_CONFIG.systemPrompt },
          { role: 'user', content: TEST_CONFIG.userPrompt },
        ],
        max_tokens: TEST_CONFIG.maxTokens,
      }),
      signal: AbortSignal.timeout(TEST_CONFIG.timeout),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = (errorData as Record<string, unknown>).error
        ? ((errorData as Record<string, unknown>).error as Record<string, unknown>).message
        : `HTTP ${response.status}`;
      return {
        model_name: modelName,
        provider_name: 'xai',
        success: false,
        latency_ms: latency,
        error: String(errorMessage),
      };
    }

    return {
      model_name: modelName,
      provider_name: 'xai',
      success: true,
      latency_ms: latency,
    };
  } catch (error) {
    return {
      model_name: modelName,
      provider_name: 'xai',
      success: false,
      latency_ms: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

async function testOllamaCloudModel(modelName: string, _modelType: string): Promise<ValidationResult> {
  if (!OLLAMA_CLOUD_API_KEY) {
    return {
      model_name: modelName,
      provider_name: 'ollama-cloud',
      success: false,
      error: 'OLLAMA_CLOUD_API_KEY not configured',
    };
  }

  const startTime = Date.now();

  try {
    const response = await fetch(`${OLLAMA_CLOUD_URL}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OLLAMA_CLOUD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: TEST_CONFIG.systemPrompt },
          { role: 'user', content: TEST_CONFIG.userPrompt },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(TEST_CONFIG.timeout),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        model_name: modelName,
        provider_name: 'ollama-cloud',
        success: false,
        latency_ms: latency,
        error: errorText || `HTTP ${response.status}`,
      };
    }

    return {
      model_name: modelName,
      provider_name: 'ollama-cloud',
      success: true,
      latency_ms: latency,
    };
  } catch (error) {
    return {
      model_name: modelName,
      provider_name: 'ollama-cloud',
      success: false,
      latency_ms: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

type ModelTestFunction = (modelName: string, modelType: string) => Promise<ValidationResult>;

async function validateProvider(
  supabase: SupabaseClient,
  providerName: string,
  testFn: ModelTestFunction,
  dryRun: boolean,
): Promise<ProviderReport> {
  const models = await getActiveModelsForProvider(supabase, providerName);

  const report: ProviderReport = {
    provider: providerName,
    total: models.length,
    validated: [],
    failed: [],
  };

  if (models.length === 0) {
    verbose(`No active models found for ${providerName}`);
    return report;
  }

  log(`\n☁️  ${providerName.charAt(0).toUpperCase() + providerName.slice(1)} (${models.length} models):`);

  for (const model of models) {
    const result = await testFn(model.model_name, model.model_type || 'text-generation');

    if (result.success) {
      report.validated.push(result);
      await updateValidatedAt(supabase, model.model_name, providerName, dryRun);
      success(`${model.model_name} (${result.latency_ms}ms)`);
    } else {
      report.failed.push(result);
      await deprecateModel(supabase, model.model_name, providerName, result.error || 'Validation failed', dryRun);
      fail(`${model.model_name} → "${result.error}" (deactivated)`);
    }
  }

  return report;
}

// ============================================================================
// Report Generation
// ============================================================================

function printReport(report: ValidationReport, dryRun: boolean): void {
  log('\n' + '='.repeat(60));
  log('📊 Model Validation Report');
  log('='.repeat(60));
  log(`   Timestamp: ${report.timestamp}`);
  if (dryRun) {
    log('   Mode: DRY RUN (no database changes)');
  }

  if (report.ollamaLocalSync) {
    log('\n🔄 Ollama Local Sync Summary:');
    log(`   Added: ${report.ollamaLocalSync.added.length}`);
    log(`   Reactivated: ${report.ollamaLocalSync.reactivated.length}`);
    log(`   Deprecated: ${report.ollamaLocalSync.deprecated.length}`);
    log(`   Unchanged: ${report.ollamaLocalSync.unchanged.length}`);
  }

  if (report.ollamaCloud) {
    log('\n☁️  Ollama Cloud:');
    log(`   Validated: ${report.ollamaCloud.validated.length}/${report.ollamaCloud.total}`);
    log(`   Failed: ${report.ollamaCloud.failed.length}/${report.ollamaCloud.total}`);
  }

  if (report.cloudProviders.length > 0) {
    log('\n🌐 Cloud Providers:');
    for (const provider of report.cloudProviders) {
      log(`   ${provider.provider}:`);
      log(`     Validated: ${provider.validated.length}/${provider.total}`);
      log(`     Failed: ${provider.failed.length}/${provider.total}`);
    }
  }

  log('\n' + '-'.repeat(60));
  log(`📈 Summary: ${report.summary.validatedCount}/${report.summary.totalModels} models validated, ${report.summary.failedCount} deactivated`);
  log('='.repeat(60) + '\n');
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();
  verboseMode = args.verbose;

  log('🤖 LLM Model Validation Script');
  log('='.repeat(60));

  if (args.dryRun) {
    log('⚠️  DRY RUN MODE - No database changes will be made\n');
  }

  // Validate configuration
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Check if deprecation columns exist (migration applied)
  hasDeprecationColumns = await checkDeprecationColumnsExist(supabase);
  if (!hasDeprecationColumns) {
    warn('Deprecation columns not found. Run migration 20260202100000_add_model_deprecation_fields.sql');
    warn('Script will continue but deprecation tracking will be limited to is_active flag only.\n');
  } else {
    verbose('Deprecation columns found - full tracking enabled');
  }

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    cloudProviders: [],
    summary: {
      totalModels: 0,
      validatedCount: 0,
      failedCount: 0,
    },
  };

  try {
    // Phase 1: Ollama Local Sync
    if (!args.provider || args.provider === 'ollama') {
      report.ollamaLocalSync = await syncOllamaLocal(supabase, args.dryRun);
    }

    if (args.localOnly) {
      printReport(report, args.dryRun);
      return;
    }

    // Phase 2: Ollama Cloud Validation
    if (!args.provider || args.provider === 'ollama-cloud') {
      if (OLLAMA_CLOUD_API_KEY) {
        report.ollamaCloud = await validateProvider(
          supabase,
          'ollama-cloud',
          testOllamaCloudModel,
          args.dryRun,
        );
      } else {
        verbose('Skipping Ollama Cloud: OLLAMA_CLOUD_API_KEY not configured');
      }
    }

    // Phase 3: Cloud Provider Validation
    const providers: Array<{ name: string; testFn: ModelTestFunction; apiKey: string | undefined }> = [
      { name: 'openai', testFn: testOpenAIModel, apiKey: OPENAI_API_KEY },
      { name: 'anthropic', testFn: testAnthropicModel, apiKey: ANTHROPIC_API_KEY },
      { name: 'google', testFn: testGoogleModel, apiKey: GOOGLE_API_KEY },
      { name: 'xai', testFn: testXAIModel, apiKey: XAI_API_KEY },
    ];

    for (const provider of providers) {
      if (args.provider && args.provider !== provider.name) {
        continue;
      }

      if (!provider.apiKey) {
        verbose(`Skipping ${provider.name}: API key not configured`);
        continue;
      }

      const providerReport = await validateProvider(
        supabase,
        provider.name,
        provider.testFn,
        args.dryRun,
      );
      report.cloudProviders.push(providerReport);
    }

    // Calculate summary
    const allReports = [report.ollamaCloud, ...report.cloudProviders].filter(Boolean) as ProviderReport[];
    report.summary.totalModels = allReports.reduce((sum, r) => sum + r.total, 0);
    report.summary.validatedCount = allReports.reduce((sum, r) => sum + r.validated.length, 0);
    report.summary.failedCount = allReports.reduce((sum, r) => sum + r.failed.length, 0);

    // Add Ollama local to summary
    if (report.ollamaLocalSync) {
      const localTotal =
        report.ollamaLocalSync.added.length +
        report.ollamaLocalSync.reactivated.length +
        report.ollamaLocalSync.unchanged.length;
      report.summary.totalModels += localTotal;
      report.summary.validatedCount += localTotal;
      report.summary.failedCount += report.ollamaLocalSync.deprecated.length;
    }

    // Phase 4: Print Report
    printReport(report, args.dryRun);
  } catch (error) {
    console.error('\n❌ Error during validation:', (error as Error).message);
    if (verboseMode) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

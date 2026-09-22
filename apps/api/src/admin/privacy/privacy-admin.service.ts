import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DATABASE_SERVICE,
  DatabaseService,
} from '@orchestratorai/planes/database';
import {
  DictionaryPseudonymizerService,
  PatternRedactionService,
  PIIPatternService,
  PIIService,
  type PIIDataType,
  type PIIPattern,
} from '@orchestratorai/planes/llm';

// ===================== Types =====================

export interface PrivacyPattern {
  id: string;
  name: string;
  dataType: string;
  patternRegex: string;
  replacement: string;
  description: string | null;
  category: string;
  priority: number;
  severity: string | null;
  isActive: boolean;
  /** Built-in patterns ship with the platform and cannot be edited or removed. */
  isBuiltIn: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreatePatternRequest {
  name: string;
  dataType: PIIDataType;
  patternRegex: string;
  description?: string;
  priority?: number;
  severity: 'showstopper' | 'flagger';
}

export type UpdatePatternRequest = Partial<CreatePatternRequest> & {
  isActive?: boolean;
};

export interface PrivacyDictionaryEntry {
  id: string;
  originalValue: string;
  pseudonym: string;
  dataType: string;
  category: string;
  organizationSlug: string | null;
  agentSlug: string | null;
  isActive: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface CreateDictionaryEntryRequest {
  originalValue: string;
  pseudonym: string;
  dataType?: string;
  category?: string;
  organizationSlug?: string | null;
  agentSlug?: string | null;
}

export type UpdateDictionaryEntryRequest =
  Partial<CreateDictionaryEntryRequest> & {
    isActive?: boolean;
  };

export interface PrivacyMapping {
  id: string;
  /**
   * SHA-256 of the source value. The original is deliberately never stored,
   * so the viewer shows the hash rather than the value it stands for.
   */
  originalHash: string;
  pseudonym: string;
  dataType: string;
  context: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface PrivacyStats {
  patterns: {
    total: number;
    active: number;
    builtIn: number;
    custom: number;
    showstopper: number;
    flagger: number;
  };
  dictionaries: {
    total: number;
    active: number;
    byCategory: Record<string, number>;
  };
  mappings: {
    total: number;
    byDataType: Record<string, number>;
  };
}

/**
 * Result of running text through the real boundary pipeline, for the admin
 * testing screen. Shows each stage so an operator can see exactly what would
 * leave the building.
 */
export interface SanitizationPreview {
  original: string;
  /** After step 1: dictionary pseudonymization. */
  pseudonymized: string;
  /** After step 2: pattern redaction. This is what the provider would see. */
  redacted: string;
  /** After reversing both, which should equal `original`. */
  restored: string;
  /** True when the round trip returned the input unchanged. */
  roundTripClean: boolean;
  detections: Array<{
    value: string;
    dataType: string;
    severity: string;
    confidence: number;
    patternName: string;
  }>;
  pseudonymsApplied: Array<{
    originalValue: string;
    pseudonym: string;
    dataType: string;
  }>;
  redactionsApplied: Array<{
    originalValue: string;
    redactedValue: string;
    dataType: string;
    patternName: string;
  }>;
  /** Whether PIIService would let this request through at all. */
  blocked: boolean;
  blockingReason: string | null;
  timings: {
    detectionMs: number;
    pseudonymizationMs: number;
    redactionMs: number;
  };
}

interface PatternRow {
  id: string;
  name: string;
  data_type: string | null;
  pattern_regex: string;
  replacement: string;
  description: string | null;
  category: string | null;
  priority: number | null;
  severity: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface DictionaryRow {
  id: string;
  original_value: string | null;
  pseudonym: string | null;
  data_type: string | null;
  category: string | null;
  organization_slug: string | null;
  agent_slug: string | null;
  is_active: boolean | null;
  created_at: string | null;
  last_used_at: string | null;
}

interface MappingRow {
  id: string;
  original_hash: string;
  pseudonym: string;
  data_type: string;
  context: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

const BUILT_IN_CATEGORY = 'pii_builtin';

/**
 * Admin-side management of the PII boundary pipeline: the detection patterns,
 * the pseudonym dictionary, and the issued pseudonym mappings.
 *
 * Everything here is behind `admin:settings`. Dictionary rows contain the
 * original values by definition — that is what makes pseudonymization
 * reversible — so this surface is as sensitive as the data it protects.
 */
@Injectable()
export class PrivacyAdminService {
  private readonly logger = new Logger(PrivacyAdminService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly piiPatternService: PIIPatternService,
    private readonly piiService: PIIService,
    private readonly dictionaryPseudonymizer: DictionaryPseudonymizerService,
    private readonly patternRedaction: PatternRedactionService,
  ) {}

  // ===================== Patterns =====================

  async listPatterns(): Promise<PrivacyPattern[]> {
    const { data, error } = (await this.db
      .from(null, 'redaction_patterns')
      .select('*')
      .order('priority', { ascending: true })) as {
      data: PatternRow[] | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => this.toPattern(row));
  }

  async createPattern(request: CreatePatternRequest): Promise<PrivacyPattern> {
    // Compile before writing: an invalid regex stored in the table breaks
    // pattern loading for every request, not just this one.
    this.assertValidRegex(request.patternRegex);

    await this.piiPatternService.addCustomPattern({
      name: request.name,
      dataType: request.dataType,
      pattern: new RegExp(request.patternRegex, 'gi'),
      description: request.description ?? '',
      priority: request.priority ?? 50,
      severity: request.severity,
    } as Omit<PIIPattern, 'enabled'>);

    const created = (await this.listPatterns()).find(
      (p) => p.name === request.name && p.category !== BUILT_IN_CATEGORY,
    );
    if (!created) {
      throw new Error(`Pattern ${request.name} was not persisted`);
    }
    return created;
  }

  async updatePattern(
    id: string,
    request: UpdatePatternRequest,
  ): Promise<PrivacyPattern> {
    const existing = await this.getPatternRow(id);

    // A built-in can be switched off — an operator needs that escape hatch
    // when one is too noisy — but its regex, severity and name are fixed.
    // Correcting a built-in's definition is a migration, so every deployment
    // gets the same fix rather than one database drifting from the others.
    const changesDefinition = Object.keys(request).some(
      (key) => key !== 'isActive',
    );
    if (changesDefinition) {
      this.assertEditable(existing);
    }

    if (request.patternRegex !== undefined) {
      this.assertValidRegex(request.patternRegex);
    }

    // `is_active` is not part of PIIPatternService's update surface, so the
    // toggle is written here and the service is asked to reload afterwards.
    const updateData: Record<string, unknown> = {};
    if (request.name !== undefined) updateData.name = request.name;
    if (request.description !== undefined) {
      updateData.description = request.description;
    }
    if (request.priority !== undefined) updateData.priority = request.priority;
    if (request.severity !== undefined) updateData.severity = request.severity;
    if (request.isActive !== undefined) updateData.is_active = request.isActive;
    if (request.patternRegex !== undefined) {
      updateData.pattern_regex = request.patternRegex;
    }
    if (request.dataType !== undefined) {
      updateData.data_type = request.dataType;
      updateData.replacement = `[${request.dataType.toUpperCase()}_REDACTED]`;
    }
    updateData.updated_at = new Date().toISOString();

    const { error } = (await this.db
      .from(null, 'redaction_patterns')
      .update(updateData)
      .eq('id', id)) as { error: { message: string } | null };

    if (error) throw new Error(error.message);

    await this.piiPatternService.forceReload();
    return this.toPattern(await this.getPatternRow(id));
  }

  async deletePattern(id: string): Promise<void> {
    const existing = await this.getPatternRow(id);
    this.assertEditable(existing);

    await this.piiPatternService.deleteCustomPattern(id);
    this.logger.log(`Deleted custom PII pattern ${id} (${existing.name})`);
  }

  // ===================== Dictionary =====================

  async listDictionaryEntries(filters?: {
    organizationSlug?: string;
    category?: string;
    search?: string;
  }): Promise<PrivacyDictionaryEntry[]> {
    let query = this.db.from(null, 'pseudonym_dictionaries').select('*');

    if (filters?.organizationSlug) {
      query = query.eq('organization_slug', filters.organizationSlug);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.search) {
      query = query.ilike('original_value', `%${filters.search}%`);
    }

    const { data, error } = (await query.order('created_at', {
      ascending: false,
    })) as {
      data: DictionaryRow[] | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => this.toDictionaryEntry(row));
  }

  async createDictionaryEntry(
    request: CreateDictionaryEntryRequest,
  ): Promise<PrivacyDictionaryEntry> {
    const { data, error } = (await this.db
      .from(null, 'pseudonym_dictionaries')
      .insert({
        original_value: request.originalValue,
        pseudonym: request.pseudonym,
        entity_type: request.dataType ?? 'name',
        data_type: request.dataType ?? 'name',
        category: request.category ?? 'general',
        organization_slug: request.organizationSlug ?? null,
        agent_slug: request.agentSlug ?? null,
        is_active: true,
      })
      .select('*')
      .single()) as {
      data: DictionaryRow | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Dictionary entry was not persisted');

    // The pipeline caches the dictionary for 5 minutes; an admin who just
    // added an entry expects the next request to use it.
    this.dictionaryPseudonymizer.clearCache();

    return this.toDictionaryEntry(data);
  }

  async updateDictionaryEntry(
    id: string,
    request: UpdateDictionaryEntryRequest,
  ): Promise<PrivacyDictionaryEntry> {
    const updateData: Record<string, unknown> = {};
    if (request.originalValue !== undefined) {
      updateData.original_value = request.originalValue;
    }
    if (request.pseudonym !== undefined) {
      updateData.pseudonym = request.pseudonym;
    }
    if (request.dataType !== undefined) {
      updateData.data_type = request.dataType;
      updateData.entity_type = request.dataType;
    }
    if (request.category !== undefined) updateData.category = request.category;
    if (request.organizationSlug !== undefined) {
      updateData.organization_slug = request.organizationSlug;
    }
    if (request.agentSlug !== undefined) {
      updateData.agent_slug = request.agentSlug;
    }
    if (request.isActive !== undefined) updateData.is_active = request.isActive;

    const { data, error } = (await this.db
      .from(null, 'pseudonym_dictionaries')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()) as {
      data: DictionaryRow | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException(`Dictionary entry ${id} not found`);

    this.dictionaryPseudonymizer.clearCache();
    return this.toDictionaryEntry(data);
  }

  async deleteDictionaryEntry(id: string): Promise<void> {
    const { error } = (await this.db
      .from(null, 'pseudonym_dictionaries')
      .delete()
      .eq('id', id)) as { error: { message: string } | null };

    if (error) throw new Error(error.message);
    this.dictionaryPseudonymizer.clearCache();
  }

  /**
   * Bulk import. Entries are upserted one at a time rather than in a single
   * statement so one bad row reports its own index instead of failing the
   * whole file silently.
   */
  async importDictionaryEntries(
    entries: CreateDictionaryEntryRequest[],
  ): Promise<{ imported: number; failures: Array<{ index: number; reason: string }> }> {
    const failures: Array<{ index: number; reason: string }> = [];
    let imported = 0;

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (!entry?.originalValue?.trim() || !entry.pseudonym?.trim()) {
        failures.push({
          index,
          reason: 'originalValue and pseudonym are both required',
        });
        continue;
      }

      try {
        await this.createDictionaryEntry(entry);
        imported++;
      } catch (error) {
        failures.push({
          index,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log(
      `Dictionary import: ${imported} entries added, ${failures.length} rejected`,
    );
    return { imported, failures };
  }

  // ===================== Mappings =====================

  async listMappings(filters?: {
    dataType?: string;
    context?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ mappings: PrivacyMapping[]; total: number }> {
    const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
    const offset = Math.max(filters?.offset ?? 0, 0);

    let query = this.db
      .from(null, 'pseudonym_mappings')
      .select('*', { count: 'exact' });

    if (filters?.dataType && filters.dataType !== 'all') {
      query = query.eq('data_type', filters.dataType);
    }
    if (filters?.context) {
      query = query.ilike('context', `%${filters.context}%`);
    }

    const { data, count, error } = (await query
      .order('usage_count', { ascending: false })
      .range(offset, offset + limit - 1)) as {
      data: MappingRow[] | null;
      count: number | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);

    return {
      mappings: (data ?? []).map((row) => ({
        id: row.id,
        originalHash: row.original_hash,
        pseudonym: row.pseudonym,
        dataType: row.data_type,
        context: row.context,
        usageCount: row.usage_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at,
      })),
      total: count ?? 0,
    };
  }

  // ===================== Stats =====================

  async getStats(): Promise<PrivacyStats> {
    const patterns = await this.listPatterns();
    const dictionaries = await this.listDictionaryEntries();

    const { data: mappingRows, error: mappingError } = (await this.db
      .from(null, 'pseudonym_mappings')
      .select('data_type')) as {
      data: Array<{ data_type: string }> | null;
      error: { message: string } | null;
    };

    if (mappingError) throw new Error(mappingError.message);

    const byCategory: Record<string, number> = {};
    for (const entry of dictionaries) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
    }

    const byDataType: Record<string, number> = {};
    for (const row of mappingRows ?? []) {
      byDataType[row.data_type] = (byDataType[row.data_type] ?? 0) + 1;
    }

    return {
      patterns: {
        total: patterns.length,
        active: patterns.filter((p) => p.isActive).length,
        builtIn: patterns.filter((p) => p.isBuiltIn).length,
        custom: patterns.filter((p) => !p.isBuiltIn).length,
        showstopper: patterns.filter((p) => p.severity === 'showstopper').length,
        flagger: patterns.filter((p) => p.severity === 'flagger').length,
      },
      dictionaries: {
        total: dictionaries.length,
        active: dictionaries.filter((e) => e.isActive).length,
        byCategory,
      },
      mappings: {
        total: mappingRows?.length ?? 0,
        byDataType,
      },
    };
  }

  // ===================== Testing =====================

  /**
   * Run text through the same three stages the LLM boundary uses, and then
   * reverse them, so an operator can confirm end to end what a provider would
   * receive and that the reply comes back intact.
   *
   * Nothing is sent to a provider and nothing is persisted.
   */
  async previewSanitization(
    text: string,
    scope?: { organizationSlug?: string | null; agentSlug?: string | null },
  ): Promise<SanitizationPreview> {
    const detectionStart = Date.now();
    const policy = await this.piiService.checkPolicy(text, {
      provider: 'preview',
      providerName: 'preview',
    });
    const detectionMs = Date.now() - detectionStart;

    // Step 1: dictionary pseudonymization
    const pseudonymResult = await this.dictionaryPseudonymizer.pseudonymizeText(
      text,
      {
        organizationSlug: scope?.organizationSlug ?? null,
        agentSlug: scope?.agentSlug ?? null,
      },
    );

    // Step 2: pattern redaction, on the pseudonymized text
    const redactionResult = await this.patternRedaction.redactPatterns(
      pseudonymResult.pseudonymizedText,
      { minConfidence: 0.8, maxMatches: 100, excludeShowstoppers: true },
    );

    // Reverse, outer layer first
    const unredacted = await this.patternRedaction.reverseRedactions(
      redactionResult.redactedText,
      redactionResult.mappings,
    );
    const restored = await this.dictionaryPseudonymizer.reversePseudonyms(
      unredacted.originalText,
      pseudonymResult.mappings,
    );

    const metadata = policy.metadata;

    return {
      original: text,
      pseudonymized: pseudonymResult.pseudonymizedText,
      redacted: redactionResult.redactedText,
      restored: restored.originalText,
      roundTripClean: restored.originalText === text,
      detections: (metadata.detectionResults?.flaggedMatches ?? []).map((m) => ({
        value: m.value,
        dataType: m.dataType,
        severity: m.severity,
        confidence: m.confidence,
        patternName: m.pattern,
      })),
      pseudonymsApplied: pseudonymResult.mappings.map((m) => ({
        originalValue: m.originalValue,
        pseudonym: m.pseudonym,
        dataType: m.dataType,
      })),
      redactionsApplied: redactionResult.mappings.map((m) => ({
        originalValue: m.originalValue,
        redactedValue: m.redactedValue,
        dataType: m.dataType,
        patternName: m.patternName,
      })),
      blocked: metadata.policyDecision?.blocked === true,
      blockingReason: metadata.policyDecision?.blockingReason ?? null,
      timings: {
        detectionMs,
        pseudonymizationMs: pseudonymResult.processingTimeMs,
        redactionMs: redactionResult.processingTimeMs,
      },
    };
  }

  // ===================== Helpers =====================

  private async getPatternRow(id: string): Promise<PatternRow> {
    const { data, error } = (await this.db
      .from(null, 'redaction_patterns')
      .select('*')
      .eq('id', id)
      .single()) as {
      data: PatternRow | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException(`Pattern ${id} not found`);
    return data;
  }

  /**
   * Built-in patterns are the platform's own SSN/credit-card/email detectors.
   * Editing or removing them would quietly weaken every deployment, so the
   * admin surface refuses rather than allowing it.
   */
  private assertEditable(row: PatternRow): void {
    if ((row.category ?? '') === BUILT_IN_CATEGORY) {
      throw new ForbiddenException(
        `Pattern "${row.name}" is built in: its definition ships with the platform and is changed by migration, not here. You can disable it, or add a custom pattern alongside it.`,
      );
    }
  }

  private assertValidRegex(source: string): void {
    // A bad pattern is the caller's input, so it is a 400 rather than the 500
    // a raw SyntaxError would produce.
    try {
      new RegExp(source, 'gi');
    } catch (error) {
      throw new BadRequestException(
        `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toPattern(row: PatternRow): PrivacyPattern {
    return {
      id: row.id,
      name: row.name,
      dataType: row.data_type ?? 'custom',
      patternRegex: row.pattern_regex,
      replacement: row.replacement,
      description: row.description,
      category: row.category ?? 'pii_custom',
      priority: row.priority ?? 50,
      severity: row.severity,
      isActive: row.is_active,
      isBuiltIn: (row.category ?? '') === BUILT_IN_CATEGORY,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toDictionaryEntry(row: DictionaryRow): PrivacyDictionaryEntry {
    return {
      id: row.id,
      originalValue: row.original_value ?? '',
      pseudonym: row.pseudonym ?? '',
      dataType: row.data_type ?? 'name',
      category: row.category ?? 'general',
      organizationSlug: row.organization_slug,
      agentSlug: row.agent_slug,
      isActive: row.is_active ?? true,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }
}

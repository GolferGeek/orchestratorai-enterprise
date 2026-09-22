/**
 * Privacy Admin API Service
 *
 * HTTP client for the PII boundary pipeline admin screens, backed by
 * `/admin/privacy` (JwtAuthGuard + RbacGuard, `admin:settings`).
 */
import axios, { AxiosInstance, AxiosError } from 'axios';

// ===================== Types =====================

export type PatternSeverity = 'showstopper' | 'flagger';

export type PiiDataType =
  | 'email'
  | 'phone'
  | 'name'
  | 'address'
  | 'ip_address'
  | 'username'
  | 'credit_card'
  | 'ssn'
  | 'custom';

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
  /** Built-in patterns ship with the platform; the API rejects edits to them. */
  isBuiltIn: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreatePatternRequest {
  name: string;
  dataType: PiiDataType;
  patternRegex: string;
  description?: string;
  priority?: number;
  severity: PatternSeverity;
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
  /** SHA-256 of the source value — the original is never stored. */
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

export interface SanitizationPreview {
  original: string;
  pseudonymized: string;
  redacted: string;
  restored: string;
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
  blocked: boolean;
  blockingReason: string | null;
  timings: {
    detectionMs: number;
    pseudonymizationMs: number;
    redactionMs: number;
  };
}

export interface DictionaryImportResult {
  imported: number;
  failures: Array<{ index: number; reason: string }>;
}

// ===================== Client =====================

class PrivacyApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${import.meta.env.VITE_API_BASE_URL || '/api'}/admin/privacy`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      config.headers['x-organization-slug'] = '*';
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          window.dispatchEvent(new Event('auth:session-expired'));
        }
        return Promise.reject(error);
      },
    );
  }

  // ===================== Stats =====================

  async getStats(): Promise<PrivacyStats> {
    const res = await this.client.get<PrivacyStats>('/stats');
    return res.data;
  }

  // ===================== Patterns =====================

  async listPatterns(): Promise<PrivacyPattern[]> {
    const res = await this.client.get<PrivacyPattern[]>('/patterns');
    return res.data;
  }

  async createPattern(request: CreatePatternRequest): Promise<PrivacyPattern> {
    const res = await this.client.post<PrivacyPattern>('/patterns', request);
    return res.data;
  }

  async updatePattern(
    id: string,
    request: UpdatePatternRequest,
  ): Promise<PrivacyPattern> {
    const res = await this.client.put<PrivacyPattern>(
      `/patterns/${id}`,
      request,
    );
    return res.data;
  }

  async deletePattern(id: string): Promise<void> {
    await this.client.delete(`/patterns/${id}`);
  }

  // ===================== Dictionary =====================

  async listDictionary(filters?: {
    organizationSlug?: string;
    category?: string;
    search?: string;
  }): Promise<PrivacyDictionaryEntry[]> {
    const res = await this.client.get<PrivacyDictionaryEntry[]>('/dictionary', {
      params: filters,
    });
    return res.data;
  }

  async createDictionaryEntry(
    request: CreateDictionaryEntryRequest,
  ): Promise<PrivacyDictionaryEntry> {
    const res = await this.client.post<PrivacyDictionaryEntry>(
      '/dictionary',
      request,
    );
    return res.data;
  }

  async updateDictionaryEntry(
    id: string,
    request: UpdateDictionaryEntryRequest,
  ): Promise<PrivacyDictionaryEntry> {
    const res = await this.client.put<PrivacyDictionaryEntry>(
      `/dictionary/${id}`,
      request,
    );
    return res.data;
  }

  async deleteDictionaryEntry(id: string): Promise<void> {
    await this.client.delete(`/dictionary/${id}`);
  }

  async importDictionary(
    entries: CreateDictionaryEntryRequest[],
  ): Promise<DictionaryImportResult> {
    const res = await this.client.post<DictionaryImportResult>(
      '/dictionary/import',
      { entries },
    );
    return res.data;
  }

  // ===================== Mappings =====================

  async listMappings(filters?: {
    dataType?: string;
    context?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ mappings: PrivacyMapping[]; total: number }> {
    const res = await this.client.get<{
      mappings: PrivacyMapping[];
      total: number;
    }>('/mappings', { params: filters });
    return res.data;
  }

  // ===================== Testing =====================

  async preview(
    text: string,
    scope?: { organizationSlug?: string | null; agentSlug?: string | null },
  ): Promise<SanitizationPreview> {
    const res = await this.client.post<SanitizationPreview>('/preview', {
      text,
      ...scope,
    });
    return res.data;
  }
}

export const privacyApiService = new PrivacyApiService();

// API service — all requests go to the Ascentek backend at localhost:4008
// Vite dev proxy forwards /scenarios, /ascentek, /lube-tech, /oem to port 4008

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(`HTTP ${res.status}: ${res.statusText}`, res.status, body);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
};

// ---- Typed endpoint wrappers ----

export interface ScenarioDescriptor {
  id: number;
  name: string;
  description: string;
  providers: string[];
}

export interface PipelineStep {
  stepNumber: number;
  label: string;
  layer: string;
  provider: string;
  data: unknown;
  metadata: Record<string, unknown>;
  timestamp: string;
  durationMs: number;
}

export interface PipelineTrace {
  messageId: string;
  traceId: string;
  source: string;
  target: string;
  method: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  steps: PipelineStep[];
}

export interface ScenarioResult {
  scenario: ScenarioDescriptor;
  result: Record<string, unknown>;
  pipelineTrace: PipelineTrace;
  effectiveConfig?: Record<string, string>;
}

// Backend PipelineTracer uses `step` not `stepNumber` — normalize on receive
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePipelineTrace(raw: any): PipelineTrace {
  return {
    ...raw,
    traceId: raw.traceId ?? '',
    steps: (raw.steps ?? []).map((s: any) => ({
      ...s,
      stepNumber: s.step ?? s.stepNumber ?? 0,
    })),
  };
}

export const scenariosApi = {
  list(): Promise<ScenarioDescriptor[]> {
    return api.get<ScenarioDescriptor[]>('/scenarios/list');
  },
  async run(id: number, config?: Record<string, string>): Promise<ScenarioResult> {
    const raw = await api.post<Record<string, unknown>>(
      `/scenarios/run/${id}`,
      config ? { config } : undefined,
    );
    return {
      ...raw,
      pipelineTrace: normalizePipelineTrace((raw as Record<string, unknown>).pipelineTrace),
    } as ScenarioResult;
  },
};

export const ascentekApi = {
  getFormulations(): Promise<unknown[]> {
    return api.get<unknown[]>('/ascentek/formulations');
  },
  getSpecs(): Promise<unknown[]> {
    return api.get<unknown[]>('/ascentek/specs');
  },
  getPricing(productId?: string): Promise<unknown[]> {
    const q = productId ? `?productId=${encodeURIComponent(productId)}` : '';
    return api.get<unknown[]>(`/ascentek/pricing${q}`);
  },
  getPartners(): Promise<unknown[]> {
    return api.get<unknown[]>('/ascentek/partners');
  },
};

export const lubeTechApi = {
  getProduction(): Promise<unknown[]> {
    return api.get<unknown[]>('/lube-tech/production');
  },
  getInventory(): Promise<unknown[]> {
    return api.get<unknown[]>('/lube-tech/inventory');
  },
  getBatches(): Promise<unknown[]> {
    return api.get<unknown[]>('/lube-tech/batches');
  },
  getQualityStandards(): Promise<unknown[]> {
    return api.get<unknown[]>('/lube-tech/quality-standards');
  },
};

export const oemApi = {
  getPurchaseOrders(): Promise<unknown[]> {
    return api.get<unknown[]>('/oem/purchase-orders');
  },
  getSpecRequirements(): Promise<unknown[]> {
    return api.get<unknown[]>('/oem/spec-requirements');
  },
  getOrderHistory(): Promise<unknown[]> {
    return api.get<unknown[]>('/oem/order-history');
  },
  getQualityComplaints(): Promise<unknown[]> {
    return api.get<unknown[]>('/oem/quality-complaints');
  },
  getApprovedSuppliers(): Promise<unknown[]> {
    return api.get<unknown[]>('/oem/approved-suppliers');
  },
};

// Transaction endpoints (via DataController)
export const transactionsApi = {
  getAscentekTransactions(): Promise<unknown> {
    return api.get<unknown>('/api/data/transactions/ascentek');
  },
  getLubeTechTransactions(): Promise<unknown> {
    return api.get<unknown>('/api/data/transactions/lube-tech');
  },
  getOemTransactions(): Promise<unknown> {
    return api.get<unknown>('/api/data/transactions/oem-partner');
  },
};

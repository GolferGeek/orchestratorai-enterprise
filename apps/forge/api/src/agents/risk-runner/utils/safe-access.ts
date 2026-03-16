export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

export function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

export type PostgrestErrorLike = {
  code?: string;
  message?: string;
};

export type PostgrestResultLike = {
  data: unknown;
  error: PostgrestErrorLike | null;
};

export function asPostgrestResult(value: unknown): PostgrestResultLike {
  const rec = asRecord(value) ?? {};
  const data = rec['data'];
  const errorRec = asRecord(rec['error']);
  if (!errorRec) {
    return { data, error: null };
  }
  return {
    data,
    error: {
      code: asString(errorRec['code']) ?? undefined,
      message: asString(errorRec['message']) ?? undefined,
    },
  };
}

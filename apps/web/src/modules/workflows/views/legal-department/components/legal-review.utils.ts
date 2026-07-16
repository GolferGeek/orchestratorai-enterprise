/**
 * Shared helpers + a small renderer used across the three review-job
 * sections (research / deal-memo / document-analysis).
 *
 * The split-out from `LegalJobReviewModal.vue` keeps each section file
 * focused on one job type's UI; this module holds the cross-cutting
 * formatting + the recursive specialist-output renderer.
 */
import { defineComponent, h, type PropType, type VNode } from 'vue';

const NOISE_KEYS = new Set([
  'rawResponse',
  'raw_response',
  'systemPrompt',
  'system_prompt',
  'prompt',
  'modelMetadata',
  'model_metadata',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
  'timestamp',
]);

export function humanizeKey(key: string): string {
  // contract → Contract; risk_level → Risk Level; keyFindings → Key Findings
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isVisibleKey(key: string): boolean {
  return !key.startsWith('_') && !NOISE_KEYS.has(key);
}

/**
 * Recursively render an unknown specialist-output blob as a readable
 * nested view: scalars become text, arrays become bullet lists, objects
 * become labeled sections. Falls back to a JSON pre-block at MAX_DEPTH or
 * for shapes we can't pretty-print (cyclic/extremely deep).
 *
 * Internal noise (`rawResponse`, timestamps, etc.) is suppressed.
 */
export const SpecialistView = defineComponent({
  name: 'SpecialistView',
  props: {
    output: {
      type: null as unknown as PropType<unknown>,
      required: true,
    },
    depth: { type: Number, default: 0 },
  },
  setup(props) {
    const MAX_DEPTH = 5;

    function renderValue(value: unknown, depth: number): VNode {
      if (depth > MAX_DEPTH) {
        return h('pre', { class: 'payload' }, JSON.stringify(value, null, 2));
      }
      if (value === null || value === undefined) {
        return h('span', { class: 'muted' }, '—');
      }
      if (typeof value === 'string') {
        return h('span', value);
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return h('span', String(value));
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return h('span', { class: 'muted' }, '(empty)');
        }
        return h(
          'ul',
          { class: 'specialist-list' },
          value.map((item, i) =>
            h('li', { key: i }, [renderValue(item, depth + 1)]),
          ),
        );
      }
      if (isPlainObject(value)) {
        const entries = Object.entries(value).filter(([k]) => isVisibleKey(k));
        if (entries.length === 0) {
          return h('span', { class: 'muted' }, '(empty)');
        }
        return h(
          'div',
          { class: 'specialist-object' },
          entries.map(([k, v]) =>
            h('div', { key: k, class: 'specialist-field' }, [
              h('span', { class: 'specialist-key' }, humanizeKey(k) + ':'),
              h('div', { class: 'specialist-value' }, [
                renderValue(v, depth + 1),
              ]),
            ]),
          ),
        );
      }
      return h('pre', { class: 'payload' }, JSON.stringify(value, null, 2));
    }

    return () => renderValue(props.output, props.depth);
  },
});

export function specialistLabel(key: string): string {
  // contract → Contract Specialist; real_estate → Real Estate Specialist
  return humanizeKey(key) + ' Specialist';
}

/**
 * Pull a riskLevel out of a specialist output if one is present at the
 * top level. Different specialists use different field names, so try the
 * common ones in order. Returns null if nothing matches.
 */
export function specialistRiskLevel(output: unknown): string | null {
  if (!isPlainObject(output)) return null;
  const candidates = [
    'riskLevel',
    'risk_level',
    'overallRisk',
    'overall_risk',
    'severity',
  ];
  for (const k of candidates) {
    const v = output[k];
    if (typeof v === 'string') return v;
    if (isPlainObject(v) && typeof v.level === 'string') return v.level;
  }
  return null;
}

export function formatRecommendation(r: unknown): string {
  if (typeof r === 'string') return r;
  if (isPlainObject(r)) {
    if (typeof r.recommendation === 'string') return r.recommendation;
    if (typeof r.text === 'string') return r.text;
    if (typeof r.description === 'string') return r.description;
  }
  try {
    return JSON.stringify(r);
  } catch {
    return String(r);
  }
}

export function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

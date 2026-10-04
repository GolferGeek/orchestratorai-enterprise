import type { DecisionClient } from './client';
import type { Answer, DecisionState, Question, SystemOneResponse } from './types';

/**
 * A rubric is a named battery of questions plus routing rules that turn the
 * answers into one decision.
 */
export type Decision = 'pass' | 'review' | 'block';

export interface RoutingRule {
  /** Question id this rule inspects. Omit for an unconditional final rule. */
  question?: string;
  /** For noul: probability. For score: the score. For choice: probability of `option`. */
  gte?: number;
  lt?: number;
  /**
   * For choice rules: which option's probability to test; for score rules:
   * which level ("0", "1", ...) probability to test instead of the weighted
   * score. `choice` requires this exact choice.
   */
  option?: string;
  choice?: string;
  /** For choice/score: route on confidence instead of the value. */
  confidence_lt?: number;
  confidence_gte?: number;
  decision: Decision;
  reason?: string;
}

/** One named input the caller supplies. The runner composes them into the request `state`. */
export interface RubricInput {
  /** `image`: a data:image/... URL or raw base64, sent as the request's `images`. */
  type: 'string' | 'object' | 'array' | 'number' | 'boolean' | 'image';
  description: string;
  /** Default true. */
  required?: boolean;
}

export interface Rubric {
  name: string;
  version: number;
  description: string;
  /** The bucket (guards, coding, compare, scoring, marketing): the folder under rubrics/. */
  group: string;
  /** Optional domain tag (legal, finance, ...). */
  domain?: string;
  /** What the state is expected to be, for humans. Optional when `input` is declared. */
  state?: string;
  /** Typed inputs: callers pass named fields and the runner builds the state from them. */
  input?: Record<string, RubricInput>;
  questions: Record<string, Question>;
  /** Evaluated in order; the first matching rule wins. The last rule is unconditional. */
  routing: RoutingRule[];
}

/** A rubric's verdict: what workflows and agent guards consume and the trace records. */
export interface RubricResult {
  rubric: string;
  version: number;
  decision: Decision;
  reason: string;
  answers: Record<string, Answer>;
  usage: SystemOneResponse['usage'];
  /** The model that answered, as the endpoint reports it (e.g. clef). */
  model: string;
}

const INPUT_TYPES = ['string', 'object', 'array', 'number', 'boolean', 'image'];

export function validateRubric(r: unknown): asserts r is Rubric {
  const o = r as Partial<Rubric>;
  if (!o || typeof o !== 'object') throw new Error('rubric must be an object');
  if (typeof o.name !== 'string' || !o.name) throw new Error('rubric.name is required');
  if (typeof o.version !== 'number') throw new Error(`rubric ${o.name}: version must be a number`);
  if (typeof o.group !== 'string' || !/^[a-z][a-z0-9-]*$/.test(o.group)) throw new Error(`rubric ${o.name}: group is required (lowercase, e.g. guards)`);
  if (!/^[a-z][a-z0-9-]*$/.test(o.name)) throw new Error(`rubric ${o.name}: name must be lowercase-kebab`);
  if (o.input !== undefined) {
    if (typeof o.input !== 'object' || Object.keys(o.input).length === 0) throw new Error(`rubric ${o.name}: input must be a non-empty map`);
    for (const [k, v] of Object.entries(o.input)) {
      if (!/^[a-z][a-z0-9_]*$/.test(k)) throw new Error(`rubric ${o.name}: input '${k}' must be snake_case`);
      if (!INPUT_TYPES.includes(v.type)) throw new Error(`rubric ${o.name}: input '${k}' has bad type`);
      if (typeof v.description !== 'string') throw new Error(`rubric ${o.name}: input '${k}' needs a description`);
    }
  }
  if (!o.questions || typeof o.questions !== 'object' || Object.keys(o.questions).length === 0) throw new Error(`rubric ${o.name}: questions is required`);
  for (const [id, q] of Object.entries(o.questions)) {
    if (!q || typeof q !== 'object') throw new Error(`rubric ${o.name}: question ${id} must be an object`);
    if (q.type === 'noul') {
      if (!q.instructions) throw new Error(`rubric ${o.name}: ${id}.instructions required`);
    } else if (q.type === 'choice') {
      if (!q.criteria || Object.keys(q.criteria).length < 2) throw new Error(`rubric ${o.name}: ${id}.criteria needs 2+ options`);
    } else if (q.type === 'score') {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 26) throw new Error(`rubric ${o.name}: ${id}.criteria needs 2-26 levels`);
    } else {
      throw new Error(`rubric ${o.name}: ${id}.type must be noul | choice | score`);
    }
  }
  if (!Array.isArray(o.routing) || o.routing.length === 0) throw new Error(`rubric ${o.name}: routing is required`);
  for (const rule of o.routing) {
    if (!['pass', 'review', 'block'].includes(rule.decision)) throw new Error(`rubric ${o.name}: routing decision must be pass | review | block`);
    if (rule.question && !(rule.question in o.questions)) throw new Error(`rubric ${o.name}: routing references unknown question ${rule.question}`);
  }
  if (o.routing[o.routing.length - 1]!.question) throw new Error(`rubric ${o.name}: the last routing rule must be unconditional`);
}

function valueFor(rule: RoutingRule, answer: Answer): number | undefined {
  if (rule.confidence_lt !== undefined || rule.confidence_gte !== undefined) {
    return answer.type === 'noul' ? undefined : answer.confidence;
  }
  switch (answer.type) {
    case 'noul':
      return answer.noul;
    case 'score':
      return rule.option ? answer.probabilities[rule.option] : answer.score;
    case 'choice':
      return rule.option ? answer.probabilities[rule.option] : undefined;
  }
}

/** Apply a rubric's routing rules to a set of answers. Pure; no network. */
export function route(rubric: Rubric, answers: Record<string, Answer>): { decision: Decision; reason: string } {
  for (const rule of rubric.routing) {
    if (!rule.question) return { decision: rule.decision, reason: rule.reason ?? 'default' };
    const answer = answers[rule.question];
    if (!answer) throw new Error(`rubric ${rubric.name}: no answer for ${rule.question}`);
    if (rule.choice !== undefined) {
      if (answer.type === 'choice' && answer.choice === rule.choice) return { decision: rule.decision, reason: rule.reason ?? `${rule.question} = ${rule.choice}` };
      continue;
    }
    const v = valueFor(rule, answer);
    if (v === undefined) continue;
    const lo = rule.confidence_gte ?? rule.gte;
    const hi = rule.confidence_lt ?? rule.lt;
    if ((lo === undefined || v >= lo) && (hi === undefined || v < hi) && (lo !== undefined || hi !== undefined)) {
      return { decision: rule.decision, reason: rule.reason ?? `${rule.question} = ${v.toFixed(2)}` };
    }
  }
  // validateRubric guarantees an unconditional last rule.
  throw new Error(`rubric ${rubric.name}: no routing rule matched`);
}

/**
 * Build the request state from caller-supplied values. Unknown keys are
 * rejected and required ones enforced; a single-string input collapses to a
 * plain string state (better than {text: "..."}).
 */
export function composeState(rubric: Rubric, values: Record<string, unknown> | string): DecisionState {
  if (!rubric.input) {
    if (typeof values === 'string') return values;
    if ('state' in values) return values.state as DecisionState;
    return values;
  }
  if (typeof values === 'string') {
    const keys = Object.keys(rubric.input);
    if (keys.length === 1) return values;
    throw new Error(`rubric ${rubric.name} expects inputs ${keys.join(', ')}`);
  }
  const state: Record<string, unknown> = {};
  for (const [k, spec] of Object.entries(rubric.input)) {
    if (spec.type === 'image') continue;
    const v = values[k];
    if (v === undefined) {
      if (spec.required !== false) throw new Error(`rubric ${rubric.name}: input '${k}' is required`);
      continue;
    }
    state[k] = v;
  }
  for (const k of Object.keys(values)) if (!(k in rubric.input)) throw new Error(`rubric ${rubric.name}: unknown input '${k}'`);
  const keys = Object.keys(state);
  return keys.length === 1 && typeof state[keys[0]!] === 'string' ? (state[keys[0]!] as string) : state;
}

/** Image-typed inputs travel as the request's `images`, not inside the state. Returns [images, remaining values]. */
export function splitImages(rubric: Rubric, values: DecisionState): [string[], DecisionState] {
  if (!rubric.input || typeof values !== 'object' || Array.isArray(values)) return [[], values];
  const images: string[] = [];
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (rubric.input[k]?.type === 'image') {
      if (typeof v !== 'string' || !v) throw new Error(`rubric ${rubric.name}: input '${k}' must be a data:image/... URL or base64`);
      images.push(v);
    } else rest[k] = v;
  }
  return [images, rest];
}

/** Run a rubric against caller inputs: one request, then routing. */
export async function runRubric(client: DecisionClient, rubric: Rubric, values: DecisionState): Promise<RubricResult> {
  const [images, rest] = splitImages(rubric, values);
  const composed = Array.isArray(rest) ? rest : composeState(rubric, rest as string | Record<string, unknown>);
  // The model needs some text to anchor the read; with image-only inputs the state names what is attached.
  const state = images.length && typeof composed === 'object' && !Array.isArray(composed) && Object.keys(composed).length === 0 ? 'The attached page image.' : composed;
  const res = await client.ask(state, rubric.questions, images);
  const { decision, reason } = route(rubric, res.answers);
  return { rubric: rubric.name, version: rubric.version, decision, reason, answers: res.answers, usage: res.usage, model: res.model };
}

/** A noul answer's probability. Asking for a question the rubric does not have as a noul is a bug, so it throws. */
export function noulOf(result: RubricResult, question: string): number {
  const answer = result.answers[question];
  if (answer?.type !== 'noul') throw new Error(`rubric ${result.rubric} has no noul answer for "${question}"`);
  return answer.noul;
}

/** A choice answer's option. Throws like noulOf. */
export function choiceOf(result: RubricResult, question: string): string {
  const answer = result.answers[question];
  if (answer?.type !== 'choice') throw new Error(`rubric ${result.rubric} has no choice answer for "${question}"`);
  return answer.choice;
}

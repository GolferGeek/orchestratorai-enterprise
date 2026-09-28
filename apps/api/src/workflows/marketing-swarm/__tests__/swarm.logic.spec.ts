import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorkflowInputError } from '../../catalog/workflow.registry';
import { gateDrafts, routeAfterGate } from '../nodes/gate.node';
import { winnerFrom } from '../nodes/pick.node';
import { swarmAdminSections, slugify } from '../swarm.admin';
import { briefText, parseSwarmInput } from '../swarm.input';
import type { SwarmState } from '../swarm.state';

const input = {
  contentType: 'linkedin-post',
  brief: { topic: 'Launch Spendline', audience: 'CFOs', goal: 'Book a demo', keyPoints: ['14-day trial'], brandVoice: 'warm, direct', keywords: ['cloud cost'] },
  evidence: null,
  writers: ['writer-creative', 'writer-technical'],
  editors: ['editor-brand'],
  evaluators: ['evaluator-quality'],
  maxEditCycles: 1,
};

describe('swarm input', () => {
  it('takes a brief, choices by slug and the number of rewrites', () => {
    const parsed = parseSwarmInput({ ...input, brief: { ...input.brief, topic: '  Launch Spendline ' } });
    expect(parsed.brief).toMatchObject({ topic: 'Launch Spendline', constraints: null });
    expect(parsed.evidence).toBeNull();
    expect(() => parseSwarmInput({ ...input, writers: [] })).toThrow(/writers needs 1 to 8/);
    expect(() => parseSwarmInput({ ...input, writers: ['a', 'a'] })).toThrow(/twice/);
    expect(() => parseSwarmInput({ ...input, maxEditCycles: 4 })).toThrow(/0, 1, 2 or 3/);
    expect(() => parseSwarmInput({ ...input, brief: { ...input.brief, tone: 'x' } })).toThrow(WorkflowInputError);
    expect(() => parseSwarmInput({ ...input, contentType: 'Blog Post' })).toThrow(/slug/);
  });

  it('writes the brief every agent reads, with the length limits', () => {
    const text = briefText(parseSwarmInput(input).brief, { name: 'LinkedIn Post', minWords: 100, maxWords: 300, maxChars: 3000 });
    expect(text).toContain('Content type: LinkedIn Post (100-300 words, at most 3000 characters).');
    expect(text).toContain('Must cover: 14-day trial.');
    expect(text).not.toContain('Constraints');
  });
});

describe('worked examples', () => {
  it('both parse', () => {
    const dir = path.join(__dirname, '../docs/showcase');
    const names = fs.readdirSync(dir);
    expect(names).toHaveLength(2);
    for (const name of names) {
      const example = JSON.parse(fs.readFileSync(path.join(dir, name, 'case.json'), 'utf8'));
      expect(() => parseSwarmInput(example.input)).not.toThrow();
    }
  });
});

describe('editor gate', () => {
  const s = (score: number) => ({ score, reason: 'r' });
  const state = (cycle: number, scores: Record<string, { score: number; reason: string }>) =>
    ({
      input: { maxEditCycles: 1 },
      cycle,
      config: {
        editors: [
          { slug: 'brand', name: 'Brand', threshold: 0.7, weights: { 'on-brand': 3, claims: 1 } },
          { slug: 'engagement', name: 'Engagement', threshold: 0.6, weights: { hook: 1 } },
        ],
      },
      drafts: [
        { writer: 'w', status: 'scoring', error: null, versions: [{ n: 1, text: 't', scores, editors: {}, feedback: null }] },
        { writer: 'x', status: 'failed', error: 'boom', versions: [] },
      ],
    }) as unknown as SwarmState;

  it('approves a draft every editor passes, in code', () => {
    const [d] = gateDrafts(state(0, { 'on-brand': s(0.8), claims: s(0.4), hook: s(0.9) }));
    expect(d!.status).toBe('approved');
    expect(d!.versions[0]!.editors).toEqual({ brand: { score: 0.7, pass: true }, engagement: { score: 0.9, pass: true } });
  });

  it('sends a short draft back while rounds remain, and leaves it final after', () => {
    const scores = { 'on-brand': s(0.5), claims: s(0.5), hook: s(0.9) };
    const first = gateDrafts(state(0, scores));
    expect(first[0]!.status).toBe('revising');
    expect(first[1]!.status).toBe('failed');
    expect(routeAfterGate({ drafts: first } as SwarmState)).toBe('coach');
    const last = gateDrafts(state(1, scores));
    expect(last[0]!.status).toBe('final');
    expect(routeAfterGate({ drafts: last } as SwarmState)).toBe('standings');
  });
});

describe('picking the winner', () => {
  const finalists = [{ writer: 'a', text: 'A' }, { writer: 'b', text: 'B' }, { writer: 'c', text: 'C' }];

  it('takes the best-placed finalist left, as rewritten if it was', () => {
    expect(winnerFrom(finalists, [])).toEqual({ writer: 'a', text: 'A', edited: false });
    expect(winnerFrom(finalists, [{ itemId: 'a', decision: 'reject' }])).toEqual({ writer: 'b', text: 'B', edited: false });
    expect(winnerFrom(finalists, [{ itemId: 'a', decision: 'reject' }, { itemId: 'b', decision: 'modify', replacement: ' B2 ' }])).toEqual({ writer: 'b', text: 'B2', edited: true });
    expect(winnerFrom(finalists, finalists.map((f) => ({ itemId: f.writer, decision: 'reject' as const })))).toBeNull();
  });

  it('refuses a decision on no finalist or an empty rewrite', () => {
    expect(() => winnerFrom(finalists, [{ itemId: 'z', decision: 'reject' }])).toThrow(/No finalist z/);
    expect(() => winnerFrom(finalists, [{ itemId: 'a', decision: 'modify', replacement: ' ' }])).toThrow(/non-empty/);
  });
});

describe('swarm admin', () => {
  it('makes slugs from names', () => {
    expect(slugify('writer', 'Bold Storyteller (Claude)')).toBe('writer-bold-storyteller-claude');
    expect(() => slugify('writer', '!!!')).toThrow(/letter or a digit/);
  });

  it('refuses fractional weights and a length range upside down', async () => {
    const store = { saveWeights: jest.fn(), select: jest.fn(async () => []), facets: jest.fn(async () => []), weights: jest.fn(async () => ({})), update: jest.fn(async () => true) };
    const sections = swarmAdminSections(store as never);
    const weights = sections.find((x) => x.key === 'editor-weights')!.matrix!;
    await expect(weights.save('marketing', [{ id: 'editor-brand', cells: { hook: 2.5 } }], 'u')).rejects.toThrow(/whole numbers/);
    expect(store.saveWeights).not.toHaveBeenCalled();
    const types = sections.find((x) => x.key === 'content-types')!;
    await expect(types.update!('marketing', 'blog-post', { name: 'Blog', guidance: 'g', minWords: 500, maxWords: 100, maxChars: null, active: true, order: 1 }, 'u')).rejects.toThrow(/Min words/);
  });
});

import * as path from 'node:path';
import { DecisionClient, DecisionError, toRawBase64 } from './client';
import { DecisionsService } from './decisions.service';
import { composeState, noulOf, choiceOf, validateRubric, type Rubric, type RubricResult } from './rubric';
import { loadRubricDir } from './rubric-files';
import { loadCaseSuites } from './cases/case-suites';

const RUBRICS = loadRubricDir(path.join(__dirname, 'rubrics'));

/** Every rubric the API's code or seed data names (workflows, marketing facets, agent guards). */
const USED = [
  'citation-in-record',
  'claims-substantiated',
  'competitor-change',
  'copy-audience-fit',
  'copy-audience-would-read',
  'copy-call-to-action',
  'copy-complete',
  'copy-hook',
  'copy-inclusive-language',
  'copy-on-brand',
  'copy-personable',
  'copy-plain-language',
  'copy-seo-natural',
  'copy-specific',
  'incident-severity',
  'invoice-po-match',
  'jd-inclusive-language',
];

const reply = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const answered = (answers: Record<string, unknown>) => ({ model: 'clef', answers, usage: { input_tokens: 120, output_tokens: 3 } });

function setup(fetchImpl: jest.Mock, apiKey = '') {
  const client = new DecisionClient({ baseUrl: 'http://ollama:11434/', model: 'clef', apiKey, timeoutMs: 1000, fetch: fetchImpl as unknown as typeof fetch });
  return new DecisionsService(client, RUBRICS);
}

describe('rubrics shipped with the API', () => {
  it('has exactly the rubrics the API uses, each valid and in its group folder', () => {
    expect([...RUBRICS.keys()].sort()).toEqual(USED);
    expect(RUBRICS.get('invoice-po-match')!.group).toBe('compare');
    expect(RUBRICS.get('copy-hook')!.group).toBe('marketing');
    for (const rubric of RUBRICS.values()) expect(() => validateRubric(rubric)).not.toThrow();
  });

  it('has labelled cases for every rubric, each with inputs the rubric accepts', () => {
    const suites = loadCaseSuites(path.join(__dirname, 'cases'));
    expect(suites.map((s) => s.rubric).sort()).toEqual(USED);
    for (const suite of suites) {
      for (const c of suite.cases) {
        expect(() => composeState(RUBRICS.get(suite.rubric)!, c.state)).not.toThrow();
        expect(c.expect.length).toBeGreaterThan(0);
      }
    }
  });

  it('refuses a missing rubric directory instead of loading nothing', () => {
    expect(() => loadRubricDir(path.join(__dirname, 'no-such-dir'))).toThrow('does not exist');
  });
});

describe('DecisionsService', () => {
  it('posts the rubric questions to /v1/systemone and routes the answers into a verdict', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      reply(answered({ same_vendor: { type: 'noul', noul: 0.05 }, same_goods: { type: 'noul', noul: 0.9 }, same_terms: { type: 'noul', noul: 0.9 } })),
    );
    const result = await setup(fetchMock).check('invoice-po-match', { invoice: 'Vendor: Apex', purchase_order: 'PO to Acme' });

    expect(result).toEqual<RubricResult>({
      rubric: 'invoice-po-match',
      version: RUBRICS.get('invoice-po-match')!.version,
      decision: 'block',
      reason: 'different vendor',
      answers: { same_vendor: { type: 'noul', noul: 0.05 }, same_goods: { type: 'noul', noul: 0.9 }, same_terms: { type: 'noul', noul: 0.9 } },
      model: 'clef',
      usage: { input_tokens: 120, output_tokens: 3 },
    });
    expect(noulOf(result, 'same_goods')).toBe(0.9);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ollama:11434/v1/systemone');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      model: 'clef',
      state: { invoice: 'Vendor: Apex', purchase_order: 'PO to Acme' },
      questions: RUBRICS.get('invoice-po-match')!.questions,
    });
    // Ollama needs no key; none is sent.
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('sends the key as a Bearer token when one is configured (a hosted endpoint)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply(answered({ exclusionary: { type: 'noul', noul: 0.1 }, level: { type: 'score', score: 0.2, probabilities: { 0: 0.8, 1: 0.2 }, confidence: 0.6, legend: {} } })));
    const result = await setup(fetchMock, 'k-123').check('jd-inclusive-language', { text: 'We want a rockstar.' });
    expect(['pass', 'review', 'block']).toContain(result.decision);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k-123');
    // A single string input is sent as a plain string state.
    expect(JSON.parse(init.body as string).state).toBe('We want a rockstar.');
  });

  it('reads a choice answer', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      reply(answered({ type: { type: 'choice', choice: 'pricing', probabilities: { pricing: 0.9 }, confidence: 0.8 }, material: { type: 'noul', noul: 0.9 } })),
    );
    const result = await setup(fetchMock).check('competitor-change', { change: '+ Pro is now $49', competitor: 'Acme - pricing page' });
    expect(choiceOf(result, 'type')).toBe('pricing');
    expect(() => noulOf(result, 'type')).toThrow('no noul answer for "type"');
  });

  it('sends image inputs as raw base64 in `images`, the way Ollama takes them', async () => {
    const page: Rubric = {
      name: 'page-legible',
      version: 1,
      description: 'Is the page legible?',
      group: 'vision',
      input: { page: { type: 'image', description: 'The page.' } },
      questions: { legible: { type: 'noul', instructions: 'Is the page legible?' } },
      routing: [{ question: 'legible', lt: 0.5, decision: 'review' }, { decision: 'pass' }],
    };
    validateRubric(page);
    const fetchMock = jest.fn().mockResolvedValue(reply(answered({ legible: { type: 'noul', noul: 0.9 } })));
    const client = new DecisionClient({ baseUrl: 'http://ollama:11434', model: 'clef', apiKey: '', timeoutMs: 1000, fetch: fetchMock as unknown as typeof fetch });
    await expect(new DecisionsService(client, new Map([[page.name, page]])).check('page-legible', { page: 'data:image/png;base64,iVBORw0K' })).resolves.toMatchObject({ decision: 'pass' });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body.images).toEqual(['iVBORw0K']);
    expect(body.state).toBe('The attached page image.');
    expect(toRawBase64('iVBORw0K')).toBe('iVBORw0K');
  });

  it('fails clearly on an unknown rubric or inputs the rubric does not declare, before any request', async () => {
    const fetchMock = jest.fn();
    const service = setup(fetchMock);
    await expect(service.check('no-such-rubric', {})).rejects.toThrow('Unknown rubric "no-such-rubric"');
    await expect(service.check('invoice-po-match', { invoice: 'x' })).rejects.toThrow("input 'purchase_order' is required");
    await expect(service.check('invoice-po-match', { invoice: 'x', purchase_order: 'y', extra: 1 })).rejects.toThrow("unknown input 'extra'");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an HTTP error, an unreachable endpoint, an unreadable reply and a missing answer', async () => {
    const inputs = { claim: 'a', record: 'b' };
    const service = (response: Response | Error) => setup(jest.fn()[response instanceof Error ? 'mockRejectedValue' : 'mockResolvedValue'](response));

    await expect(service(reply({ error: 'model "clef" not found' }, 404)).check('citation-in-record', inputs)).rejects.toMatchObject({
      name: 'DecisionError',
      status: 404,
      message: 'decision model 404: model "clef" not found',
    });
    await expect(service(new Error('ECONNREFUSED')).check('citation-in-record', inputs)).rejects.toThrow(
      'decision model unreachable at http://ollama:11434/v1/systemone: ECONNREFUSED',
    );
    await expect(service(reply({ answers: {} })).check('citation-in-record', inputs)).rejects.toThrow('unreadable response');
    await expect(service(reply('<html>proxy</html>')).check('citation-in-record', inputs)).rejects.toThrow('non-JSON');
    // A question left unanswered would let routing fall through to a default it never earned.
    await expect(service(reply(answered({ supported: { type: 'noul', noul: 0.9 } }))).check('citation-in-record', inputs)).rejects.toBeInstanceOf(DecisionError);
  });

  it('requires a base URL', () => {
    expect(() => new DecisionClient({ baseUrl: '', model: 'clef', apiKey: '', timeoutMs: 1 })).toThrow('DECISION_BASE_URL is not set');
  });

  it("lists the endpoint's decision models", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      reply({
        models: [
          { name: 'clef:latest', capabilities: ['decision'], details: { parameter_size: '27B' } },
          { name: 'qwen3.6:latest', capabilities: ['completion'] },
        ],
      }),
    );
    const client = new DecisionClient({ baseUrl: 'http://ollama:11434', model: 'clef', apiKey: '', timeoutMs: 1000, fetch: fetchMock as unknown as typeof fetch });
    await expect(client.models()).resolves.toEqual([{ name: 'clef', parameterSize: '27B' }]);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://ollama:11434/api/tags');
  });
});

describe('route', () => {
  it('requires an unconditional last rule', () => {
    const rubric = { ...RUBRICS.get('invoice-po-match')!, routing: [{ question: 'same_vendor', lt: 0.2, decision: 'block' }] } as Rubric;
    expect(() => validateRubric(rubric)).toThrow('last routing rule must be unconditional');
  });
});

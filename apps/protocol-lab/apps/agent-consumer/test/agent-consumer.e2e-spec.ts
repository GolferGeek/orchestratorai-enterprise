/**
 * AgentConsumer E2E Tests
 *
 * These are real integration tests that verify the AgentConsumer app
 * can discover and consume ResearchHub via JSON content negotiation.
 *
 * Prerequisites: ResearchHub (port 6403) must be running.
 * Start with `npm run dev:research-hub` from the workspace root.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

const RESEARCH_HUB_BASE = 'http://localhost:6403';

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function ensureResearchHubRunning(): Promise<void> {
  try {
    const res = await fetch(`${RESEARCH_HUB_BASE}/health`);
    if (!res.ok) throw new Error(`ResearchHub health: ${res.status}`);
  } catch (err) {
    throw new Error(
      `ResearchHub is not running on port 6403. Start it with: npm run dev:research-hub\n${err}`,
    );
  }
}

function getBase(app: INestApplication): string {
  const addr = app.getHttpServer().address();
  return `http://localhost:${addr.port}`;
}

describe('AgentConsumer E2E — JSON Agent-to-Agent Communication', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    await ensureResearchHubRunning();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);
    base = getBase(app);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ==========================================================================
  // 1. Agent Discovery via .well-known/agent.json
  // ==========================================================================

  describe('Agent Discovery', () => {
    it('AgentConsumer should have its own agent card at .well-known/agent.json', async () => {
      const res = await fetch(`${base}/.well-known/agent.json`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const card = await res.json();

      expect(card.id).toBe('agent-consumer');
      expect(card.name).toBe('AgentConsumer');
      expect(Array.isArray(card.capabilities)).toBe(true);
      expect(card.capabilities.length).toBeGreaterThanOrEqual(6);
      expect(Array.isArray(card.endpoints)).toBe(true);
      expect(card.endpoints.length).toBeGreaterThanOrEqual(9);
      expect(card.protocols).toBeDefined();
      expect(card.protocols.discovery).toContain('well-known');
      expect(card.protocols.transport).toContain('http-rest');
    });

    it('AgentConsumer should discover ResearchHub agent card directly', async () => {
      const res = await fetch(`${RESEARCH_HUB_BASE}/.well-known/agent.json`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const card = await res.json();

      expect(card.id).toBeDefined();
      expect(card.name).toBeDefined();
      expect(Array.isArray(card.capabilities)).toBe(true);
      expect(Array.isArray(card.endpoints)).toBe(true);
    });

    it('/api/explore/discovery should return ResearchHub card via AgentConsumer proxy', async () => {
      const res = await fetch(`${base}/api/explore/discovery`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const card = await res.json();

      expect(card.id).toBeDefined();
      expect(card.name).toBeDefined();
      expect(Array.isArray(card.capabilities)).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Categories — JSON consumption
  // ==========================================================================

  describe('Categories (JSON)', () => {
    it('/api/explore/categories should return array of research categories', async () => {
      const res = await fetch(`${base}/api/explore/categories`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const categories = await res.json();

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThanOrEqual(5);

      const first = categories[0];
      expect(first.id).toBeDefined();
      expect(first.name).toBeDefined();
      expect(first.description).toBeDefined();
      expect(typeof first.articleCount).toBe('number');
      expect(typeof first.signalStrength).toBe('number');
    });

    it('categories should include known IDs', async () => {
      const res = await fetch(`${base}/api/explore/categories`, {
        headers: JSON_HEADERS,
      });
      const categories = await res.json();
      const ids = categories.map((c: any) => c.id);

      expect(ids).toContain('ai-agents');
      expect(ids).toContain('payment-protocols');
      expect(ids).toContain('trust-identity');
      expect(ids).toContain('multi-agent-systems');
      expect(ids).toContain('ai-safety');
    });
  });

  // ==========================================================================
  // 3. Articles — JSON consumption with filtering
  // ==========================================================================

  describe('Articles (JSON)', () => {
    it('/api/explore/articles should return all articles as JSON', async () => {
      const res = await fetch(`${base}/api/explore/articles`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const articles = await res.json();

      expect(Array.isArray(articles)).toBe(true);
      expect(articles.length).toBeGreaterThanOrEqual(13);

      const first = articles[0];
      expect(first.id).toBeDefined();
      expect(first.title).toBeDefined();
      expect(first.summary).toBeDefined();
      expect(first.categoryId).toBeDefined();
      expect(typeof first.signalStrength).toBe('number');
    });

    it('/api/explore/articles?category=ai-agents should filter by category', async () => {
      const res = await fetch(
        `${base}/api/explore/articles?category=ai-agents`,
        { headers: JSON_HEADERS },
      );

      expect(res.status).toBe(200);
      const articles = await res.json();

      expect(Array.isArray(articles)).toBe(true);
      expect(articles.length).toBeGreaterThanOrEqual(3);
      articles.forEach((a: any) => {
        expect(a.categoryId).toBe('ai-agents');
      });
    });

    it('/api/explore/articles?q=payment should search by query', async () => {
      const res = await fetch(
        `${base}/api/explore/articles?q=payment`,
        { headers: JSON_HEADERS },
      );

      expect(res.status).toBe(200);
      const articles = await res.json();

      expect(Array.isArray(articles)).toBe(true);
      expect(articles.length).toBeGreaterThanOrEqual(1);
    });

    it('/api/explore/articles/:id should return a single article with full content', async () => {
      const res = await fetch(`${base}/api/explore/articles/art-001`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const article = await res.json();

      expect(article.id).toBe('art-001');
      expect(article.title).toBeDefined();
      expect(article.content).toBeDefined();
      expect(article.content.length).toBeGreaterThan(100);
      expect(article.categoryId).toBe('ai-agents');
    });
  });

  // ==========================================================================
  // 4. Signals — Scout watchlist as JSON
  // ==========================================================================

  describe('Signals (JSON)', () => {
    it('/api/explore/signals should return watchlist signals', async () => {
      const res = await fetch(`${base}/api/explore/signals`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const signals = await res.json();

      expect(Array.isArray(signals)).toBe(true);
      expect(signals.length).toBeGreaterThanOrEqual(5);

      const first = signals[0];
      expect(first.id).toBeDefined();
      expect(first.title).toBeDefined();
      expect(first.description).toBeDefined();
      expect(typeof first.signalStrength).toBe('number');
      expect(first.category).toBeDefined();
      expect(first.detectedAt).toBeDefined();
      expect(first.recommendedAction).toBeDefined();
    });

    it('/api/explore/signals?category=ai-safety should filter by category', async () => {
      const res = await fetch(
        `${base}/api/explore/signals?category=ai-safety`,
        { headers: JSON_HEADERS },
      );

      expect(res.status).toBe(200);
      const signals = await res.json();

      expect(Array.isArray(signals)).toBe(true);
      expect(signals.length).toBeGreaterThanOrEqual(1);
      signals.forEach((s: any) => {
        expect(s.category).toBe('ai-safety');
      });
    });
  });

  // ==========================================================================
  // 5. Narratives — Personality-lens content
  // ==========================================================================

  describe('Narratives (JSON)', () => {
    it('/api/explore/narratives/pragmatist should return a personality narrative', async () => {
      const res = await fetch(
        `${base}/api/explore/narratives/pragmatist`,
        { headers: JSON_HEADERS },
      );

      expect(res.status).toBe(200);
      const narrative = await res.json();

      expect(narrative.personality).toBe('pragmatist');
      expect(narrative.content).toBeDefined();
      expect(narrative.content.length).toBeGreaterThan(50);
    });

    it('each valid personality should return a unique narrative', async () => {
      const personalities = ['pragmatist', 'strategist', 'contrarian', 'futurist', 'scout'];

      for (const personality of personalities) {
        const res = await fetch(
          `${base}/api/explore/narratives/${personality}`,
          { headers: JSON_HEADERS },
        );

        expect(res.status).toBe(200);
        const narrative = await res.json();
        expect(narrative.personality).toBe(personality);
        expect(narrative.title).toBeDefined();
        expect(narrative.content.length).toBeGreaterThan(50);
      }
    });
  });

  // ==========================================================================
  // 6. Analyze — POST topic analysis
  // ==========================================================================

  describe('Analyze (JSON POST)', () => {
    it('/api/explore/analyze should return topic analysis', async () => {
      const res = await fetch(`${base}/api/explore/analyze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ topic: 'AI agents', personality: 'strategist' }),
      });

      // NestJS @Post returns 201 by default
      expect(res.status).toBe(201);
      const analysis = await res.json();

      expect(analysis.topic).toBe('AI agents');
      expect(analysis.personality).toBe('strategist');
      expect(analysis.analyzedAt).toBeDefined();
      expect(Array.isArray(analysis.relatedArticles)).toBe(true);
      expect(Array.isArray(analysis.relatedCategories)).toBe(true);
      expect(Array.isArray(analysis.relatedSignals)).toBe(true);
    });

    it('analyze should find articles matching the topic', async () => {
      const res = await fetch(`${base}/api/explore/analyze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ topic: 'payment' }),
      });

      expect(res.status).toBe(201);
      const analysis = await res.json();

      expect(analysis.topic).toBe('payment');
      expect(analysis.relatedArticles.length).toBeGreaterThanOrEqual(1);
    });

    it('analyze with specific personality should reflect that personality', async () => {
      const res = await fetch(`${base}/api/explore/analyze`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ topic: 'trust', personality: 'contrarian' }),
      });

      expect(res.status).toBe(201);
      const analysis = await res.json();

      expect(analysis.personality).toBe('contrarian');
      expect(analysis.narrative).toBeDefined();
    });
  });

  // ==========================================================================
  // 7. Search — POST full-text search
  // ==========================================================================

  describe('Search (JSON POST)', () => {
    it('/api/explore/search should return search results', async () => {
      const res = await fetch(`${base}/api/explore/search`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ query: 'agent' }),
      });

      expect(res.status).toBe(201);
      const results = await res.json();

      expect(results.query).toBe('agent');
      expect(Array.isArray(results.articles)).toBe(true);
      expect(Array.isArray(results.categories)).toBe(true);
      expect(typeof results.totalResults).toBe('number');
      expect(results.totalResults).toBeGreaterThan(0);
      expect(results.searchedAt).toBeDefined();
    });

    it('search with category filter should scope results', async () => {
      const res = await fetch(`${base}/api/explore/search`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ query: 'protocol', category: 'ai-agents' }),
      });

      expect(res.status).toBe(201);
      const results = await res.json();

      expect(results.query).toBe('protocol');
      expect(results.category).toBe('ai-agents');
      results.articles.forEach((a: any) => {
        expect(a.categoryId).toBe('ai-agents');
      });
    });

    it('search results should include total count matching articles + categories', async () => {
      const res = await fetch(`${base}/api/explore/search`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ query: 'safety' }),
      });

      expect(res.status).toBe(201);
      const results = await res.json();

      expect(results.totalResults).toBe(
        results.articles.length + results.categories.length,
      );
    });
  });

  // ==========================================================================
  // 8. Full Demo — Combined endpoint exercising all capabilities
  // ==========================================================================

  describe('Full Demo (JSON)', () => {
    it('/api/explore/full-demo should aggregate all ResearchHub capabilities', async () => {
      const res = await fetch(`${base}/api/explore/full-demo`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const demo = await res.json();

      expect(demo.summary).toContain('ResearchHub');
      expect(demo.consumedAt).toBeDefined();

      // Agent card discovery
      expect(demo.researchHubCard).toBeDefined();
      expect(demo.researchHubCard.id).toBeDefined();
      expect(Array.isArray(demo.researchHubCard.capabilities)).toBe(true);

      // All result sections present
      expect(demo.results).toBeDefined();
      expect(Array.isArray(demo.results.categories)).toBe(true);
      expect(demo.results.categories.length).toBeGreaterThanOrEqual(5);

      expect(Array.isArray(demo.results.articles)).toBe(true);
      expect(demo.results.articles.length).toBeGreaterThanOrEqual(13);

      expect(Array.isArray(demo.results.signals)).toBe(true);
      expect(demo.results.signals.length).toBeGreaterThanOrEqual(5);

      expect(demo.results.narrative).toBeDefined();
      expect(demo.results.narrative.personality).toBe('pragmatist');

      expect(demo.results.analysis).toBeDefined();
      expect(demo.results.analysis.topic).toBe('AI agents in enterprise workflows');
      expect(Array.isArray(demo.results.analysis.relatedArticles)).toBe(true);

      expect(demo.results.search).toBeDefined();
      expect(demo.results.search.query).toBe('machine learning');
    });
  });

  // ==========================================================================
  // 9. Health check
  // ==========================================================================

  describe('Health', () => {
    it('/health should return ok status', async () => {
      const res = await fetch(`${base}/health`, {
        headers: JSON_HEADERS,
      });

      expect(res.status).toBe(200);
      const health = await res.json();

      expect(health.status).toBe('ok');
      expect(health.app).toBe('agent-consumer');
      expect(health.timestamp).toBeDefined();
    });
  });

  // ==========================================================================
  // 10. Content Negotiation — verify all responses are proper JSON
  // ==========================================================================

  describe('Content Negotiation', () => {
    it('all GET endpoints should return application/json content type', async () => {
      const endpoints = [
        `${base}/health`,
        `${base}/.well-known/agent.json`,
        `${base}/api/explore/discovery`,
        `${base}/api/explore/categories`,
        `${base}/api/explore/articles`,
        `${base}/api/explore/signals`,
      ];

      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, { headers: JSON_HEADERS });
        expect(res.status).toBe(200);
        const contentType = res.headers.get('content-type');
        expect(contentType).toContain('application/json');

        // Verify the response is valid parseable JSON
        const body = await res.text();
        expect(() => JSON.parse(body)).not.toThrow();
      }
    });

    it('POST endpoints should also return application/json', async () => {
      const postEndpoints = [
        { url: `${base}/api/explore/analyze`, body: { topic: 'test' } },
        { url: `${base}/api/explore/search`, body: { query: 'test' } },
      ];

      for (const { url, body } of postEndpoints) {
        const res = await fetch(url, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        });
        expect(res.status).toBe(201);
        const contentType = res.headers.get('content-type');
        expect(contentType).toContain('application/json');
      }
    });
  });

  // ==========================================================================
  // 11. Agent-to-Agent Content Negotiation — Accept header verification
  // ==========================================================================

  describe('Agent-to-Agent Protocol', () => {
    it('ResearchHub should respond with JSON when Accept: application/json is sent', async () => {
      const res = await fetch(`${RESEARCH_HUB_BASE}/api/categories`, {
        headers: { Accept: 'application/json' },
      });

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('application/json');

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('both agents should expose .well-known/agent.json for mutual discovery', async () => {
      // AgentConsumer's card
      const consumerCard = await fetch(`${base}/.well-known/agent.json`).then(r => r.json());
      // ResearchHub's card
      const researchCard = await fetch(`${RESEARCH_HUB_BASE}/.well-known/agent.json`).then(r => r.json());

      // Both should have the standard agent card fields
      for (const card of [consumerCard, researchCard]) {
        expect(card.id).toBeDefined();
        expect(card.name).toBeDefined();
        expect(card.version).toBeDefined();
        expect(Array.isArray(card.capabilities)).toBe(true);
        expect(Array.isArray(card.endpoints)).toBe(true);
      }

      // AgentConsumer's capabilities should reference ResearchHub operations
      const consumerCapIds = consumerCard.capabilities.map((c: any) => c.id);
      expect(consumerCapIds).toContain('discover');
      expect(consumerCapIds).toContain('explore-articles');
      expect(consumerCapIds).toContain('explore-categories');
    });
  });
});

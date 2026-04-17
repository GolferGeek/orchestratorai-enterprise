/**
 * Sentinel Ingest — Fetch Source Node.
 *
 * Fetches items from a configured source (RSS, webpage, or API).
 * Generates SHA-256 content hashes for deduplication.
 */
import { createHash } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Parser = require('rss-parser');
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { SentinelIngestState } from '../sentinel-ingest.state';
import type { RawItem } from '../sentinel-ingest.types';

const rssParser = new Parser({
  timeout: 30_000,
  headers: {
    'User-Agent': 'OrchestratorAI-Sentinel/1.0',
  },
});

/**
 * Generate a content hash from title + url + publishedAt.
 * Deterministic deduplication key.
 */
export function generateContentHash(
  title: string,
  url: string,
  publishedAt: string | null,
): string {
  const input = `${title}|${url}|${publishedAt ?? ''}`;
  return createHash('sha256').update(input).digest('hex');
}

export function createFetchSourceNode(observability: ObservabilityService) {
  return async function fetchSourceNode(
    state: SentinelIngestState,
  ): Promise<Partial<SentinelIngestState>> {
    const ctx = state.executionContext;
    const source = state.sourceConfig;

    if (!source) {
      return {
        status: 'failed',
        error: 'No source configuration provided',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Fetching source: ${source.name} (${source.source_type}: ${source.url})`,
      { step: 'sentinel_fetch_start', progress: 5 },
    );

    try {
      let rawItems: RawItem[];

      switch (source.source_type) {
        case 'rss':
          rawItems = await fetchRss(source.url);
          break;
        case 'webpage':
          rawItems = await fetchWebpage(source.url);
          break;
        case 'api':
          rawItems = await fetchApi(source.url);
          break;
        default:
          throw new Error(
            `Unsupported source type: ${String(source.source_type)}`,
          );
      }

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Fetched ${rawItems.length} items from ${source.name}`,
        {
          step: 'sentinel_fetch_complete',
          progress: 20,
          itemCount: rawItems.length,
        },
      );

      return {
        rawItems,
        status: 'deduplicating',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        status: 'failed',
        error: `Fetch failed for ${source.name}: ${msg}`,
      };
    }
  };
}

// ── RSS Fetch ──────────────────────────────────────────────────────────

async function fetchRss(url: string): Promise<RawItem[]> {
  const feed = await rssParser.parseURL(url);
  return (feed.items ?? []).map((item) => {
    const title = item.title ?? 'Untitled';
    const itemUrl = item.link ?? url;
    const publishedAt = item.isoDate ?? item.pubDate ?? null;
    const summary = item.contentSnippet ?? item.content ?? '';
    const fullText = item.content ?? item.contentSnippet ?? '';

    return {
      title,
      summary: summary.slice(0, 500),
      fullText,
      url: itemUrl,
      publishedAt,
      contentHash: generateContentHash(title, itemUrl, publishedAt),
    };
  });
}

// ── Webpage Fetch (basic article extraction) ───────────────────────────

async function fetchWebpage(url: string): Promise<RawItem[]> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'OrchestratorAI-Sentinel/1.0' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // Extract text from <article> or <main> tags, or fall back to <body>
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const rawHtml = articleMatch?.[1] ?? mainMatch?.[1] ?? bodyMatch?.[1] ?? html;

  // Strip HTML tags for plain text
  const text = rawHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? url;

  return [
    {
      title,
      summary: text.slice(0, 500),
      fullText: text,
      url,
      publishedAt: new Date().toISOString(),
      contentHash: generateContentHash(title, url, null),
    },
  ];
}

// ── API Fetch (generic JSON endpoint) ──────────────────────────────────

async function fetchApi(url: string): Promise<RawItem[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'OrchestratorAI-Sentinel/1.0',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as unknown;
  const items = Array.isArray(json) ? json : [json];

  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v : v != null ? `${v as string}` : fallback;

  return items.map((item: Record<string, unknown>) => {
    const title = str(item.title, str(item.name, 'Untitled'));
    const itemUrl = str(item.url, str(item.link, url));
    const publishedAt: string | null =
      typeof item.publishedAt === 'string'
        ? item.publishedAt
        : typeof item.date === 'string'
          ? item.date
          : null;
    const summary = str(item.summary, str(item.description));
    const fullText = str(item.content, str(item.body, str(item.text, summary)));

    return {
      title,
      summary: summary.slice(0, 500),
      fullText,
      url: itemUrl,
      publishedAt,
      contentHash: generateContentHash(title, itemUrl, publishedAt),
    };
  });
}

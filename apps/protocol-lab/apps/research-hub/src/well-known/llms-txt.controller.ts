import { Controller, Get, Header } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { ArticlesService } from '../articles/articles.service';
import { ScoutService } from '../scout/scout.service';
import { NarrativesService } from '../narratives/narratives.service';

/**
 * /llms.txt and /llms-full.txt — Machine-readable site index for LLMs
 *
 * Follows the llmstxt.org specification. Provides curated markdown
 * content designed to fit within LLM context windows.
 */
@Controller()
export class LlmsTxtController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly articles: ArticlesService,
    private readonly scout: ScoutService,
    private readonly narratives: NarrativesService,
  ) {}

  @Get('llms.txt')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  getLlmsTxt(): string {
    return `# ResearchHub

> AI Opportunity & Risk research API — serves analysis through personality lenses. Supports content negotiation: request \`Accept: text/markdown\` for agent-friendly markdown, or \`Accept: application/json\` for structured JSON.

## API Endpoints

- [Categories](/api/categories): Research categories with signal strength scores
- [Articles](/api/articles): Research articles on AI topics (filterable by \`?category=\` or \`?q=\`)
- [Scout Signals](/agent/signals): Emerging signals from the research watchlist
- [Narratives](/agent/narrative/pragmatist): Personality-lens narratives (pragmatist, strategist, contrarian, futurist, scout)

## Discovery

- [Agent Card](/.well-known/agent.json): A2A agent capability card
- [Full Content](/llms-full.txt): Complete research data in one document

## Content Negotiation

Every endpoint above supports \`Accept: text/markdown\` for markdown or \`Accept: application/json\` for JSON. Try both:

\`\`\`
curl -H "Accept: text/markdown" http://localhost:6403/api/categories
curl -H "Accept: application/json" http://localhost:6403/api/categories
\`\`\`

## Optional (POST endpoints)

- [Analyze](/agent/analyze): Deep topic analysis (body: \`{"topic": "...", "personality": "pragmatist"}\`)
- [Search](/agent/search): Full-text search (body: \`{"query": "...", "category": "ai-agents"}\`)
`;
  }

  @Get('llms-full.txt')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  getLlmsFullTxt(): string {
    const allCategories = this.categories.getAll();
    const articleSummaries = this.articles.getAll();
    const allArticles = articleSummaries.map((a) => this.articles.getById(a.id)!).filter(Boolean);
    const allSignals = this.scout.getWatchlist();

    const personalities = this.narratives.getAllPersonalities();
    const allNarratives = personalities.map((p) => this.narratives.getByPersonality(p)!).filter(Boolean);

    const lines: string[] = [];

    lines.push('# ResearchHub — Full Content');
    lines.push('');
    lines.push('> Complete research data for LLM consumption. This document contains all categories, articles, signals, and narratives available from the ResearchHub API.');
    lines.push('');

    // Categories
    lines.push('---');
    lines.push('');
    lines.push('## Categories');
    lines.push('');
    for (const cat of allCategories) {
      lines.push(`### ${cat.name}`);
      lines.push(`${cat.description}`);
      lines.push(`*Signal strength: ${cat.signalStrength}% | ${cat.articleCount} articles*`);
      lines.push('');
    }

    // Articles
    lines.push('---');
    lines.push('');
    lines.push('## Articles');
    lines.push('');
    for (const article of allArticles) {
      lines.push(`### ${article.title}`);
      lines.push(`*${article.date} | ${article.author} | Category: ${article.categoryId} | Signal: ${article.signalStrength}%*`);
      lines.push('');
      lines.push(article.summary);
      lines.push('');
      if (article.content) {
        lines.push(article.content);
        lines.push('');
      }
      lines.push(`[View article](/api/articles/${article.id})`);
      lines.push('');
    }

    // Signals
    lines.push('---');
    lines.push('');
    lines.push('## Scout Signals');
    lines.push('');
    for (const signal of allSignals) {
      lines.push(`### ${signal.title}`);
      lines.push(`*${signal.category} | Signal: ${signal.signalStrength}% | Source: ${signal.source} | Detected: ${signal.detectedAt}*`);
      lines.push('');
      lines.push(signal.description);
      lines.push('');
      lines.push(`> **Recommended action:** ${signal.recommendedAction}`);
      lines.push('');
    }

    // Narratives
    lines.push('---');
    lines.push('');
    lines.push('## Personality Narratives');
    lines.push('');
    for (const narrative of allNarratives) {
      lines.push(`### ${narrative.personality}: ${narrative.title}`);
      lines.push(`*Generated: ${narrative.generatedAt}*`);
      lines.push('');
      lines.push(narrative.content);
      lines.push('');
      lines.push(`[View narrative](/agent/narrative/${narrative.personality})`);
      lines.push('');
    }

    // Navigation footer
    lines.push('---');
    lines.push('');
    lines.push('## Navigation');
    lines.push('');
    lines.push('- [Back to index](/llms.txt)');
    lines.push('- [Agent Card](/.well-known/agent.json)');
    lines.push('- [Categories](/api/categories)');
    lines.push('- [Articles](/api/articles)');
    lines.push('- [Signals](/agent/signals)');
    lines.push('');

    return lines.join('\n');
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AgentCard } from '@agent-communication/shared-types';
import { getAuthHeaders , getAuthHeadersAsync } from '@agent-communication/shared-protocols';

const RESEARCH_HUB_BASE = 'http://localhost:6403';

async function jsonHeaders(): Promise<Record<string, string>> {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(await getAuthHeadersAsync()),
  };
}

@Injectable()
export class ResearchClientService implements OnModuleInit {
  private readonly logger = new Logger(ResearchClientService.name);
  private discoveredCard: AgentCard | null = null;

  async onModuleInit() {
    await this.discover();
  }

  async discover(): Promise<AgentCard> {
    const url = `${RESEARCH_HUB_BASE}/.well-known/agent.json`;
    this.logger.log(`Discovering ResearchHub via ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: await jsonHeaders(),
    });

    if (!response.ok) {
      throw new Error(`ResearchHub discovery failed: ${response.status} ${response.statusText}`);
    }

    const card: AgentCard = await response.json();
    this.discoveredCard = card;
    this.logger.log(`Discovered ResearchHub: ${card.name} (${card.version}) with ${card.capabilities.length} capabilities`);
    return card;
  }

  getDiscoveredCard(): AgentCard | null {
    return this.discoveredCard;
  }

  async getCategories(): Promise<unknown> {
    const url = `${RESEARCH_HUB_BASE}/api/categories`;
    this.logger.log(`GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: await jsonHeaders(),
    });

    if (!response.ok) {
      throw new Error(`getCategories failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getArticles(query?: string, category?: string): Promise<unknown> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);

    const qs = params.toString();
    const url = `${RESEARCH_HUB_BASE}/api/articles${qs ? `?${qs}` : ''}`;
    this.logger.log(`GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: await jsonHeaders(),
    });

    if (!response.ok) {
      throw new Error(`getArticles failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getArticle(id: string): Promise<unknown> {
    const url = `${RESEARCH_HUB_BASE}/api/articles/${id}`;
    this.logger.log(`GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: await jsonHeaders(),
    });

    if (!response.ok) {
      throw new Error(`getArticle(${id}) failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getSignals(category?: string): Promise<unknown> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);

    const qs = params.toString();
    const url = `${RESEARCH_HUB_BASE}/api/scout/watchlist${qs ? `?${qs}` : ''}`;
    this.logger.log(`GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: await jsonHeaders(),
    });

    if (!response.ok) {
      throw new Error(`getSignals failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getNarrative(personality: string): Promise<unknown> {
    const url = `${RESEARCH_HUB_BASE}/agent/narrative/${personality}`;
    this.logger.log(`GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: await jsonHeaders(),
    });

    if (!response.ok) {
      throw new Error(`getNarrative(${personality}) failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async analyze(topic: string, personality?: string): Promise<unknown> {
    const url = `${RESEARCH_HUB_BASE}/agent/analyze`;
    this.logger.log(`POST ${url} { topic: "${topic}", personality: "${personality ?? 'default'}" }`);

    const response = await fetch(url, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ topic, personality }),
    });

    if (!response.ok) {
      throw new Error(`analyze failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async search(query: string, category?: string): Promise<unknown> {
    const url = `${RESEARCH_HUB_BASE}/agent/search`;
    this.logger.log(`POST ${url} { query: "${query}", category: "${category ?? 'all'}" }`);

    const response = await fetch(url, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ query, category }),
    });

    if (!response.ok) {
      throw new Error(`search failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

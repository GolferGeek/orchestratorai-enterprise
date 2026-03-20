export interface FeedSource {
  id: string;
  name: string;
  type: 'RSS' | 'API' | 'SCRAPE';
  url: string;
  status: 'active' | 'paused' | 'error';
  lastFetch: string;
  articleCount: number;
}

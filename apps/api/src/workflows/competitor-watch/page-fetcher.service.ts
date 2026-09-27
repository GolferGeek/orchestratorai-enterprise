import { Injectable } from '@nestjs/common';
import { OutboundUrlValidatorService } from '../../secure-conversations/security/outbound-url-validator.service';
import { pageText } from './page-text';

const USER_AGENT = 'Mozilla/5.0 (compatible; OrchestratorAI-CompetitorWatch/1.0)';
const TIMEOUT_MS = 30_000;

/**
 * Fetches a competitor page's text: live (through the outbound URL validator,
 * so a source cannot point at a private network) or the Internet Archive's
 * newest copy from on or before a date, used as the first baseline.
 */
@Injectable()
export class PageFetcherService {
  constructor(private readonly outbound: OutboundUrlValidatorService) {}

  /** Every hop is validated: a public page must not redirect into a private network. */
  async live(url: string): Promise<string> {
    let next = url;
    for (let hop = 0; hop < 5; hop++) {
      const safe = await this.outbound.assertSafe(next);
      const response = await fetch(safe.toString(), { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        next = new URL(location, safe).toString();
        continue;
      }
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return pageText(await response.text());
    }
    throw new Error(`${url} redirected more than 5 times`);
  }

  async archived(url: string, onOrBefore: Date): Promise<{ text: string; archivedAt: string }> {
    const day = onOrBefore.toISOString().slice(0, 10).replace(/-/g, '');
    const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&to=${day}&output=json&limit=-1&filter=statuscode:200&fl=timestamp,original`;
    const listing = JSON.parse(await this.get(cdx)) as string[][];
    const capture = listing.at(-1);
    if (!capture || capture[0] === 'timestamp') {
      throw new Error(`The Internet Archive has no copy of ${url} from on or before ${onOrBefore.toISOString().slice(0, 10)}`);
    }
    const [timestamp, original] = capture as [string, string];
    const archivedAt = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`;
    return { text: pageText(await this.get(`https://web.archive.org/web/${timestamp}id_/${original}`)), archivedAt };
  }

  /** The Internet Archive only (a fixed public host). */
  private async get(url: string): Promise<string> {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.text();
  }
}

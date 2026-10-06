import type { MailAttachment, MailboxClient, MailMessage } from './mailbox.types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
/** The longest body an event carries; the rest is cut with a note. */
export const MAX_BODY_CHARS = 100_000;

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** The parts of a Gmail API message the watcher reads. */
export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailApiMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload: GmailPart;
}

/**
 * Gmail through its REST API with an OAuth refresh token (scope
 * gmail.readonly). Every failure throws with Google's answer; nothing is
 * retried or skipped here.
 */
export class GmailMailboxClient implements MailboxClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly credentials: GmailCredentials,
    private readonly http: typeof fetch = fetch,
  ) {}

  async address(): Promise<string> {
    const profile = (await this.get('/profile')) as { emailAddress?: string };
    if (!profile.emailAddress) throw new Error('Gmail profile has no emailAddress');
    return profile.emailAddress;
  }

  async search(query: string, after: Date): Promise<string[]> {
    // Gmail's after: takes epoch seconds; a minute of overlap, since the
    // dedupe key makes a message seen twice one event.
    const q = `${query} after:${Math.floor(after.getTime() / 1000) - 60}`;
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q, maxResults: '100', ...(pageToken ? { pageToken } : {}) });
      const page = (await this.get(`/messages?${params}`)) as { messages?: Array<{ id: string }>; nextPageToken?: string };
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return ids;
  }

  async message(id: string): Promise<MailMessage> {
    return parseGmailMessage((await this.get(`/messages/${encodeURIComponent(id)}?format=full`)) as GmailApiMessage);
  }

  async attachment(messageId: string, attachment: MailAttachment): Promise<Buffer> {
    const body = (await this.get(
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}`,
    )) as { data?: string };
    if (typeof body.data !== 'string') throw new Error(`Gmail attachment ${attachment.filename} of ${messageId} has no data`);
    return Buffer.from(body.data, 'base64url');
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.http(`${API}${path}`, {
      headers: { authorization: `Bearer ${await this.accessToken()}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Gmail ${path.split('?')[0]} answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - Date.now() > 60_000) return this.token.value;
    const response = await this.http(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        refresh_token: this.credentials.refreshToken,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!response.ok || !body.access_token) {
      throw new Error(`Google refused the mailbox's refresh token: ${body.error ?? response.status} ${body.error_description ?? ''}`.trim());
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }
}

function header(part: GmailPart, name: string): string {
  return part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decode(data: string | undefined): string {
  return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

function walk(part: GmailPart, visit: (part: GmailPart) => void): void {
  visit(part);
  for (const child of part.parts ?? []) walk(child, visit);
}

/** HTML to readable text: block ends become line breaks, tags and entities go. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A Gmail API message as a MailMessage: headers, the text body, and the attachments to fetch. */
export function parseGmailMessage(message: GmailApiMessage): MailMessage {
  const texts: string[] = [];
  const htmls: string[] = [];
  const attachments: MailAttachment[] = [];
  walk(message.payload, (part) => {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: (part.mimeType ?? 'application/octet-stream').toLowerCase(),
        size: part.body.size ?? 0,
      });
    } else if (part.mimeType === 'text/plain' && !part.filename) {
      texts.push(decode(part.body?.data));
    } else if (part.mimeType === 'text/html' && !part.filename) {
      htmls.push(decode(part.body?.data));
    }
  });
  let body = texts.length ? texts.join('\n').trim() : htmlToText(htmls.join('\n'));
  if (body.length > MAX_BODY_CHARS) body = `${body.slice(0, MAX_BODY_CHARS)}\n[cut: the message is longer than ${MAX_BODY_CHARS} characters]`;
  const receivedAt = new Date(Number(message.internalDate));
  if (Number.isNaN(receivedAt.getTime())) throw new Error(`Gmail message ${message.id} has no internalDate`);
  return {
    id: message.id,
    threadId: message.threadId,
    from: header(message.payload, 'From'),
    to: header(message.payload, 'To'),
    subject: header(message.payload, 'Subject'),
    receivedAt,
    body,
    attachments,
  };
}

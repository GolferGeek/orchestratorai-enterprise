import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { OrganizationCredentialsService } from '../../common/credentials/organization-credentials.service';
import { GmailMailboxClient } from './gmail-mailbox.client';
import { MailboxWatchesRepository } from './mailbox-watches.repository';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
/** How long a consent link stays good. */
const STATE_TTL_MS = 15 * 60 * 1000;
export const MAILBOX_OAUTH_CALLBACK_PATH = '/api/ambient/mailbox-oauth/callback';

interface ConsentState {
  watchId: string;
  orgSlug: string;
  expiresAt: number;
}

/**
 * "Connect mailbox": an admin opens Google's consent page for the watch's
 * mailbox (read-only scope), Google sends the browser back to the callback,
 * and the refresh token is checked to sign in as the watched address and
 * stored as the organization's gmail/<credential key> credential. The state
 * is signed (HMAC under a key derived from CREDENTIALS_ENCRYPTION_KEY) and
 * expires, so the callback only takes consent this platform asked for.
 */
@Injectable()
export class MailboxOAuthService implements OnModuleInit {
  private stateKey!: Buffer;
  private redirectUri!: string;
  /** Google's endpoints are called through this (specs replace it). */
  http: typeof fetch = fetch;

  constructor(
    private readonly watches: MailboxWatchesRepository,
    private readonly credentials: OrganizationCredentialsService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    const secret = await this.config.getSecret('CREDENTIALS_ENCRYPTION_KEY');
    this.stateKey = createHmac('sha256', secret).update('mailbox-oauth-state').digest();
    this.redirectUri = `${this.config.getRequired('PUBLIC_WEB_URL').replace(/\/$/, '')}${MAILBOX_OAUTH_CALLBACK_PATH}`;
  }

  /** Google's consent URL for the watch's mailbox. */
  async consentUrl(orgSlug: string, watchId: string): Promise<string> {
    const watch = await this.watches.get(orgSlug, watchId);
    if (!watch) throw new MailboxConnectError(`Mailbox watch ${watchId} not found`);
    const clientId = await this.credentials.get({ organizationSlug: orgSlug, type: 'google', key: 'client_id' });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      login_hint: watch.mailbox,
      state: this.sign({ watchId, orgSlug, expiresAt: Date.now() + STATE_TTL_MS }),
    });
    return `${AUTHORIZE_URL}?${params}`;
  }

  /** Google's answer: exchange the code, check the mailbox, store the refresh token. Returns the connected address. */
  async complete(code: string, state: string): Promise<string> {
    const { watchId, orgSlug } = this.verify(state);
    const watch = await this.watches.get(orgSlug, watchId);
    if (!watch) throw new MailboxConnectError('The mailbox watch this consent was for no longer exists');
    const organizationSlug = orgSlug;
    const [clientId, clientSecret] = await Promise.all([
      this.credentials.get({ organizationSlug, type: 'google', key: 'client_id' }),
      this.credentials.get({ organizationSlug, type: 'google', key: 'client_secret' }),
    ]);
    const response = await this.http(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: this.redirectUri,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json()) as { refresh_token?: string; error?: string; error_description?: string };
    if (!response.ok) throw new MailboxConnectError(`Google refused the consent: ${body.error ?? response.status} ${body.error_description ?? ''}`.trim());
    if (!body.refresh_token) throw new MailboxConnectError('Google sent no refresh token; remove the app\'s access in the Google account and connect again');
    const address = await new GmailMailboxClient({ clientId, clientSecret, refreshToken: body.refresh_token }, this.http).address();
    if (address.toLowerCase() !== watch.mailbox.toLowerCase()) {
      throw new MailboxConnectError(`You signed in as ${address}, but this watch reads ${watch.mailbox}. Connect again as ${watch.mailbox}.`);
    }
    await this.credentials.put({ organizationSlug, type: 'gmail', key: watch.credential_key }, body.refresh_token, { mailbox: watch.mailbox, scope: SCOPE });
    return address;
  }

  private sign(state: ConsentState): string {
    const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
    return `${payload}.${createHmac('sha256', this.stateKey).update(payload).digest('base64url')}`;
  }

  private verify(token: string): ConsentState {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) throw new MailboxConnectError('This connect link is not one this platform made');
    const expected = createHmac('sha256', this.stateKey).update(payload).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new MailboxConnectError('This connect link is not one this platform made');
    }
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ConsentState;
    if (state.expiresAt < Date.now()) throw new MailboxConnectError('This connect link has expired; start again from the mailbox watch');
    return state;
  }
}

/** Something the person connecting can fix; its message is shown to them. */
export class MailboxConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailboxConnectError';
  }
}

import { randomBytes } from 'node:crypto';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import type { OrganizationCredentialsService } from '../../common/credentials/organization-credentials.service';
import { MailboxConnectError, MailboxOAuthService } from './mailbox-oauth.service';
import type { MailboxWatch, MailboxWatchesRepository } from './mailbox-watches.repository';

const watch = { id: 'w1', org_slug: 'acme', mailbox: 'Order@acme.example', credential_key: 'order-mailbox' } as MailboxWatch;

async function setup(signedInAs = 'order@acme.example', tokenBody: Record<string, unknown> = { refresh_token: 'rt-1', access_token: 'at-0' }) {
  const stored: unknown[] = [];
  const credentials = {
    get: jest.fn(async ({ key }: { key: string }) => (key === 'client_id' ? 'cid' : 'csecret')),
    put: jest.fn(async (...args: unknown[]) => { stored.push(args); }),
  } as unknown as OrganizationCredentialsService;
  const config = {
    getSecret: async () => randomBytes(32).toString('base64'),
    getRequired: (key: string) => ({ PUBLIC_WEB_URL: 'https://platform.example/' })[key]!,
  } as unknown as ConfigProvider;
  const service = new MailboxOAuthService({ get: jest.fn(async () => watch) } as unknown as MailboxWatchesRepository, credentials, config);
  await service.onModuleInit();
  const exchanges: URLSearchParams[] = [];
  service.http = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(String(init?.body));
      exchanges.push(body);
      if (body.get('grant_type') === 'authorization_code') return new Response(JSON.stringify(tokenBody), { status: 200 });
      return new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ emailAddress: signedInAs }), { status: 200 });
  }) as typeof fetch;
  return { service, credentials, stored, exchanges };
}

function stateOf(url: string): string {
  return new URL(url).searchParams.get('state')!;
}

describe('MailboxOAuthService', () => {
  it('asks Google for read-only access to the watched mailbox, offline, coming back to the platform', async () => {
    const { service } = await setup();
    const url = new URL(await service.consentUrl('acme', 'w1'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'cid',
      redirect_uri: 'https://platform.example/api/ambient/mailbox-oauth/callback',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      login_hint: 'Order@acme.example',
    });
  });

  it('stores the refresh token as the watch\'s credential once it signs in as the watched mailbox', async () => {
    const { service, stored, exchanges } = await setup();
    const state = stateOf(await service.consentUrl('acme', 'w1'));
    expect(await service.complete('code-1', state)).toBe('order@acme.example');
    expect(exchanges[0]!.get('code')).toBe('code-1');
    expect(exchanges[0]!.get('redirect_uri')).toBe('https://platform.example/api/ambient/mailbox-oauth/callback');
    expect(stored).toEqual([[
      { organizationSlug: 'acme', type: 'gmail', key: 'order-mailbox' },
      'rt-1',
      { mailbox: 'Order@acme.example', scope: 'https://www.googleapis.com/auth/gmail.readonly' },
    ]]);
  });

  it('stores nothing when the person signed in as another mailbox', async () => {
    const { service, stored } = await setup('someone@acme.example');
    const state = stateOf(await service.consentUrl('acme', 'w1'));
    await expect(service.complete('code-1', state)).rejects.toThrow('You signed in as someone@acme.example, but this watch reads Order@acme.example');
    expect(stored).toEqual([]);
  });

  it('refuses a state it did not sign', async () => {
    const { service } = await setup();
    const state = stateOf(await service.consentUrl('acme', 'w1'));
    const [payload] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ watchId: 'w1', orgSlug: 'other', expiresAt: Date.now() + 60_000 })).toString('base64url');
    await expect(service.complete('code-1', `${forged}.${state.split('.')[1]}`)).rejects.toThrow('not one this platform made');
    await expect(service.complete('code-1', `${payload}`)).rejects.toThrow('not one this platform made');
  });

  it('refuses an expired link', async () => {
    const { service } = await setup();
    const state = stateOf(await service.consentUrl('acme', 'w1'));
    jest.useFakeTimers({ now: Date.now() + 16 * 60 * 1000 });
    try {
      await expect(service.complete('code-1', state)).rejects.toThrow('has expired');
    } finally {
      jest.useRealTimers();
    }
  });

  it('says what to do when Google sends no refresh token', async () => {
    const { service } = await setup('order@acme.example', { access_token: 'at-0' });
    const state = stateOf(await service.consentUrl('acme', 'w1'));
    await expect(service.complete('code-1', state)).rejects.toBeInstanceOf(MailboxConnectError);
  });
});

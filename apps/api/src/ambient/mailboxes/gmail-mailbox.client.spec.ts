import { GmailMailboxClient, htmlToText, MAX_BODY_CHARS, parseGmailMessage, type GmailApiMessage } from './gmail-mailbox.client';

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url');

const order: GmailApiMessage = {
  id: 'm1',
  threadId: 't1',
  internalDate: String(Date.parse('2026-10-06T15:00:00Z')),
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: 'Lab Buyer <buyer@lab.example>' },
      { name: 'To', value: 'order@acme.example' },
      { name: 'Subject', value: 'PO 4502' },
    ],
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: b64('Please ship the attached PO.') } },
          { mimeType: 'text/html', body: { data: b64('<p>Please ship the <b>attached</b> PO.</p>') } },
        ],
      },
      { mimeType: 'application/pdf', filename: 'PO-4502.pdf', body: { attachmentId: 'a1', size: 2048 } },
    ],
  },
};

describe('parseGmailMessage', () => {
  it('reads the headers, the text body and the attachments', () => {
    expect(parseGmailMessage(order)).toEqual({
      id: 'm1',
      threadId: 't1',
      from: 'Lab Buyer <buyer@lab.example>',
      to: 'order@acme.example',
      subject: 'PO 4502',
      receivedAt: new Date('2026-10-06T15:00:00Z'),
      body: 'Please ship the attached PO.',
      attachments: [{ id: 'a1', filename: 'PO-4502.pdf', mimeType: 'application/pdf', size: 2048 }],
    });
  });

  it('falls back to the HTML part as text when there is no text part', () => {
    const htmlOnly = { ...order, payload: { ...order.payload, parts: [{ mimeType: 'text/html', body: { data: b64('<div>Line one</div><div>Two &amp; three</div>') } }] } };
    expect(parseGmailMessage(htmlOnly).body).toBe('Line one\nTwo & three');
  });

  it('cuts a very long body and says so', () => {
    const long = { ...order, payload: { ...order.payload, parts: [{ mimeType: 'text/plain', body: { data: b64('x'.repeat(MAX_BODY_CHARS + 10)) } }] } };
    expect(parseGmailMessage(long).body).toMatch(/\[cut: the message is longer than/);
  });

  it('refuses a message with no receive time', () => {
    expect(() => parseGmailMessage({ ...order, internalDate: 'x' })).toThrow('has no internalDate');
  });
});

describe('htmlToText', () => {
  it('drops scripts and styles', () => {
    expect(htmlToText('<style>p{}</style><p>Hi</p><script>x()</script>')).toBe('Hi');
  });
});

describe('GmailMailboxClient', () => {
  function fakeGoogle(pages: Array<{ messages?: Array<{ id: string }>; nextPageToken?: string }>) {
    const calls: string[] = [];
    const http = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push(href);
      if (href.startsWith('https://oauth2.googleapis.com/token')) {
        expect(String(init?.body)).toContain('grant_type=refresh_token');
        return new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }), { status: 200 });
      }
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer at-1');
      if (href.includes('/profile')) return new Response(JSON.stringify({ emailAddress: 'order@acme.example' }), { status: 200 });
      return new Response(JSON.stringify(pages.shift() ?? {}), { status: 200 });
    });
    return { http, calls };
  }

  it('refreshes the token once, and pages through a search after the cursor', async () => {
    const { http, calls } = fakeGoogle([{ messages: [{ id: 'm1' }], nextPageToken: 'p2' }, { messages: [{ id: 'm2' }] }]);
    const client = new GmailMailboxClient({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, http as unknown as typeof fetch);
    expect(await client.address()).toBe('order@acme.example');
    const after = new Date('2026-10-06T15:00:00Z');
    expect(await client.search('in:inbox', after)).toEqual(['m1', 'm2']);
    expect(calls.filter((c) => c.includes('oauth2'))).toHaveLength(1);
    const q = new URL(calls[2]!).searchParams.get('q');
    expect(q).toBe(`in:inbox after:${after.getTime() / 1000 - 60}`);
    expect(new URL(calls[3]!).searchParams.get('pageToken')).toBe('p2');
  });

  it('says plainly when Google refuses the refresh token', async () => {
    const http = jest.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 }));
    const client = new GmailMailboxClient({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, http as unknown as typeof fetch);
    await expect(client.address()).rejects.toThrow("Google refused the mailbox's refresh token: invalid_grant Token has been expired or revoked.");
  });
});

import { readBoundedJsonResponse } from './bounded-json-response';

describe('readBoundedJsonResponse', () => {
  it('parses JSON within the configured byte limit', async () => {
    const response = new Response(JSON.stringify({ ok: true }));
    await expect(
      readBoundedJsonResponse(response, 1024, 'response'),
    ).resolves.toEqual({ ok: true });
  });

  it('rejects a declared oversized response before reading it', async () => {
    const response = new Response('{}', {
      headers: { 'content-length': '2048' },
    });
    await expect(
      readBoundedJsonResponse(response, 1024, 'response'),
    ).rejects.toThrow('exceeds');
  });

  it('rejects a streamed response that crosses the limit', async () => {
    const response = new Response('x'.repeat(1025));
    await expect(
      readBoundedJsonResponse(response, 1024, 'response'),
    ).rejects.toThrow('exceeds');
  });

  it('rejects malformed JSON with a stable error', async () => {
    const response = new Response('not-json');
    await expect(
      readBoundedJsonResponse(response, 1024, 'response'),
    ).rejects.toThrow('not valid JSON');
  });
});

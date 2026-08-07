import { downloadMediaBytes } from '../download-media';

describe('downloadMediaBytes', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('downloads a bounded response without following redirects', async () => {
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array(Buffer.from('video')),
        })
        .mockResolvedValueOnce({ done: true }),
      cancel: jest.fn(),
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '5' }),
      body: { getReader: () => reader },
    }) as jest.Mock;

    await expect(
      downloadMediaBytes('https://media.example/video.mp4'),
    ).resolves.toEqual(Buffer.from('video'));
    expect(global.fetch).toHaveBeenCalledWith(
      new URL('https://media.example/video.mp4'),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('rejects an oversized declared response before reading it', async () => {
    const getReader = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(250 * 1024 * 1024 + 1) }),
      body: { getReader },
    }) as jest.Mock;

    await expect(
      downloadMediaBytes('https://media.example/video.mp4'),
    ).rejects.toThrow('exceeds the permitted size');
    expect(getReader).not.toHaveBeenCalled();
  });

  it('rejects invalid protocols before network access', async () => {
    global.fetch = jest.fn() as jest.Mock;

    await expect(
      downloadMediaBytes('file:///etc/passwd'),
    ).rejects.toThrow('must use HTTP or HTTPS');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

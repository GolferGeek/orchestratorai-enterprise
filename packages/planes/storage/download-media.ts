const MEDIA_DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_MEDIA_DOWNLOAD_BYTES = 250 * 1024 * 1024;

/**
 * Downloads provider-generated media with fixed network and memory bounds.
 * Product code remains responsible for validating the destination against its
 * SSRF policy immediately before calling the storage plane.
 */
export async function downloadMediaBytes(rawUrl: string): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Media download URL is invalid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Media download URL must use HTTP or HTTPS');
  }

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    MEDIA_DOWNLOAD_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new Error(`Media provider returned HTTP ${response.status}`);
    }

    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
      if (!/^\d+$/.test(declaredLength)) {
        throw new Error('Media provider returned an invalid content length');
      }
      const parsedLength = Number(declaredLength);
      if (
        !Number.isSafeInteger(parsedLength) ||
        parsedLength > MAX_MEDIA_DOWNLOAD_BYTES
      ) {
        throw new Error('Media download exceeds the permitted size');
      }
    }

    if (!response.body) {
      throw new Error('Media provider returned an empty response body');
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) {
        throw new Error('Media provider returned an invalid response chunk');
      }
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_MEDIA_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new Error('Media download exceeds the permitted size');
      }
      chunks.push(Buffer.from(value));
    }

    if (receivedBytes === 0) {
      throw new Error('Media provider returned an empty response body');
    }
    return Buffer.concat(chunks, receivedBytes);
  } finally {
    clearTimeout(timeout);
  }
}

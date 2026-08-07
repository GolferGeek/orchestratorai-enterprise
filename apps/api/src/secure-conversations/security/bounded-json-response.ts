export async function readBoundedJsonResponse(
  response: Response,
  maximumBytes: number,
  description: string,
): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maximumBytes) {
    throw new Error(`${description} exceeds ${maximumBytes} bytes`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`${description} is empty`);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`${description} exceeds ${maximumBytes} bytes`);
    }
    chunks.push(value);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new Error(`${description} is not valid JSON`);
  }
}

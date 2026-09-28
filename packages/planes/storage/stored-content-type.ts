/**
 * The content type a storage object was stored with. A download returns it as
 * stored; an object without one is an error, not something to guess from the
 * file name (the guess used to turn every .txt, .md, .csv and .docx into
 * application/octet-stream, so workflow documents of those types could not be
 * read back).
 */
export function storedContentType(stored: string | null | undefined, bucket: string, path: string): string {
  const type = typeof stored === 'string' ? stored.split(';')[0]!.trim() : '';
  if (!type) throw new Error(`Storage object ${bucket}/${path} has no stored content type`);
  return type;
}

/**
 * Rules every media storage provider applies to generated media: the file
 * extension for its type (an unknown type is refused, never stored as .bin),
 * and SVG checked for active content before it is kept.
 */

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

export function extensionForMime(mime: string): string {
  const extension = EXTENSIONS[mime];
  if (!extension) throw new Error(`Generated media of type '${mime}' is not a type the platform stores`);
  return extension;
}

/** What makes an SVG active: scripts, event handlers, embedded HTML, and links or loads that leave the file. */
const ACTIVE_SVG: Array<[RegExp, string]> = [
  [/<script[\s>]/i, 'a <script> element'],
  [/\son[a-z]+\s*=/i, 'an event handler attribute'],
  [/<foreignObject[\s>]/i, 'a <foreignObject> element'],
  [/javascript:/i, 'a javascript: URL'],
  [/<(iframe|object|embed)[\s>]/i, 'an embedded document'],
  [/(?:href|src)\s*=\s*["'](?!#|data:image\/)/i, 'a link or load outside the file'],
];

/**
 * A generated SVG is model output and untrusted: one that could run script or
 * reach out when opened is refused, with what was found, rather than stored.
 */
export function assertInertSvg(data: Buffer): void {
  const text = data.toString('utf8');
  if (!/<svg[\s>]/i.test(text)) throw new Error('Generated SVG has no <svg> element');
  for (const [pattern, what] of ACTIVE_SVG) {
    if (pattern.test(text)) throw new Error(`Generated SVG refused: it contains ${what}`);
  }
}

/** Check generated media for its type before any provider stores it. */
export function checkGeneratedMedia(data: Buffer, mime: string): string {
  const extension = extensionForMime(mime);
  if (mime === 'image/svg+xml') assertInertSvg(data);
  return extension;
}

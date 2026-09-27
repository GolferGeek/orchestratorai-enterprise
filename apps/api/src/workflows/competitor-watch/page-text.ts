/** Visible text of an HTML page: scripts, styles and tags removed, entities decoded, whitespace collapsed. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&mdash;|&ndash;/g, '-')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_SEGMENT = 240;

/** The page as comparable segments: sentences, with long runs cut at word boundaries. */
export function segments(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    let rest = sentence.trim();
    while (rest.length > MAX_SEGMENT) {
      const cut = rest.lastIndexOf(' ', MAX_SEGMENT);
      const at = cut > 40 ? cut : MAX_SEGMENT;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest.length >= 3) out.push(rest);
  }
  return out;
}

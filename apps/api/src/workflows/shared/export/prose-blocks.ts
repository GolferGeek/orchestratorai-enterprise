import { b, t, type ExportBlock, type ExportInline } from './export-document';

/** "**bold** plain" -> bold and text runs; other markdown emphasis is dropped. */
function runs(text: string): ExportInline[] {
  const out: ExportInline[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) out.push(b(part.slice(2, -2)));
    else out.push(t(part.replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:])/g, '$1$2')));
  }
  return out;
}

/**
 * Model-written prose (which often arrives as light markdown) as export
 * blocks: headings become bold paragraphs, "*" / "-" / "1." lines become
 * bullets, blank lines separate paragraphs.
 */
export function proseBlocks(text: string): ExportBlock[] {
  const blocks: ExportBlock[] = [];
  let bullets: ExportInline[][] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', runs: runs(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length) blocks.push({ kind: 'bullets', items: bullets.map((r) => ({ runs: r })) });
    bullets = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^(?:[*-]|\d+\.)\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!line) {
      flushParagraph();
      flushBullets();
    } else if (heading) {
      flushParagraph();
      flushBullets();
      blocks.push({ kind: 'paragraph', runs: [b(heading[1]!.replace(/\*\*/g, ''))] });
    } else if (bullet) {
      flushParagraph();
      bullets.push(runs(bullet[1]!));
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

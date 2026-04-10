import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function parseVideoEmbed(url: string): string | null {
  if (!url) return null;
  // YouTube: youtube.com/watch?v=ID or youtu.be/ID
  const ytWatch = url.match(/youtube\.com\/watch\?v=([\w-]+)/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;
  const ytShort = url.match(/youtu\.be\/([\w-]+)/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;
  // Loom: loom.com/share/ID
  const loom = url.match(/loom\.com\/share\/([\w]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return null;
}

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

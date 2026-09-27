/** One region that differs between two versions of a page. */
export interface Hunk {
  removed: string[];
  added: string[];
}

/** Largest pages compared segment by segment; beyond this the comparison refuses rather than truncating. */
export const MAX_SEGMENTS = 2500;

/**
 * The regions where `after` differs from `before` (a longest-common-
 * subsequence alignment of segments), largest first, at most `limit`.
 */
export function diffSegments(before: string[], after: string[], limit: number): Hunk[] {
  if (before.length > MAX_SEGMENTS || after.length > MAX_SEGMENTS) {
    throw new Error(`Page too large to compare (${before.length} / ${after.length} segments; limit ${MAX_SEGMENTS})`);
  }
  const n = before.length;
  const m = after.length;
  const lcs = new Int32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[at(i, j)] = before[i] === after[j] ? lcs[at(i + 1, j + 1)]! + 1 : Math.max(lcs[at(i + 1, j)]!, lcs[at(i, j + 1)]!);
    }
  }
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  const flush = () => {
    if (current && (current.removed.length || current.added.length)) hunks.push(current);
    current = null;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      flush();
      i++;
      j++;
    } else if (j < m && (i === n || lcs[at(i, j + 1)]! >= lcs[at(i + 1, j)]!)) {
      (current ??= { removed: [], added: [] }).added.push(after[j++]!);
    } else {
      (current ??= { removed: [], added: [] }).removed.push(before[i++]!);
    }
  }
  flush();
  const size = (h: Hunk) => h.removed.join(' ').length + h.added.join(' ').length;
  return hunks.sort((a, b) => size(b) - size(a)).slice(0, limit);
}

/** A hunk as Jev and the writer read it. */
export function describeHunk(hunk: Hunk, maxChars = 1200): string {
  const side = (label: string, lines: string[]) => (lines.length ? `${label}: ${lines.join(' ')}` : '');
  const text = [side('Removed', hunk.removed), side('Added', hunk.added)].filter(Boolean).join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)} [...]` : text;
}

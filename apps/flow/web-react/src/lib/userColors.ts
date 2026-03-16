// Distinct colors for users - using HSL for easy manipulation
const USER_COLORS = [
  { bg: 'hsl(220, 90%, 56%)', light: 'hsl(220, 90%, 95%)' }, // Blue
  { bg: 'hsl(142, 71%, 45%)', light: 'hsl(142, 71%, 93%)' }, // Green
  { bg: 'hsl(262, 83%, 58%)', light: 'hsl(262, 83%, 94%)' }, // Purple
  { bg: 'hsl(24, 95%, 53%)', light: 'hsl(24, 95%, 93%)' },   // Orange
  { bg: 'hsl(340, 82%, 52%)', light: 'hsl(340, 82%, 94%)' }, // Pink
  { bg: 'hsl(174, 72%, 40%)', light: 'hsl(174, 72%, 92%)' }, // Teal
  { bg: 'hsl(45, 93%, 47%)', light: 'hsl(45, 93%, 92%)' },   // Yellow
  { bg: 'hsl(0, 84%, 60%)', light: 'hsl(0, 84%, 94%)' },     // Red
];

// Cache for user -> color index mapping
const userColorCache = new Map<string, number>();
let nextColorIndex = 0;

export function getUserColor(userId: string | null, guestName: string | null): { bg: string; light: string } {
  const key = userId || guestName || 'unknown';
  
  if (!userColorCache.has(key)) {
    userColorCache.set(key, nextColorIndex % USER_COLORS.length);
    nextColorIndex++;
  }
  
  return USER_COLORS[userColorCache.get(key)!];
}

export function getMixedColor(userIds: string[], guestNames: string[]): { bg: string; light: string } {
  const allKeys = [...userIds, ...guestNames].filter(Boolean);
  
  if (allKeys.length === 0) {
    return { bg: 'hsl(var(--muted))', light: 'hsl(var(--muted))' };
  }
  
  if (allKeys.length === 1) {
    return getUserColor(userIds[0] || null, guestNames[0] || null);
  }
  
  // Mix colors by averaging HSL values
  const colors = allKeys.map(key => {
    const userId = userIds.includes(key) ? key : null;
    const guestName = guestNames.includes(key) ? key : null;
    return getUserColor(userId, guestName);
  });
  
  // Parse HSL and average
  const parseHSL = (hsl: string) => {
    const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!match) return { h: 0, s: 0, l: 0 };
    return { h: parseInt(match[1]), s: parseInt(match[2]), l: parseInt(match[3]) };
  };
  
  const avgBg = colors.reduce(
    (acc, c) => {
      const parsed = parseHSL(c.bg);
      return { h: acc.h + parsed.h, s: acc.s + parsed.s, l: acc.l + parsed.l };
    },
    { h: 0, s: 0, l: 0 }
  );
  
  const count = colors.length;
  const mixedBg = `hsl(${Math.round(avgBg.h / count)}, ${Math.round(avgBg.s / count)}%, ${Math.round(avgBg.l / count)}%)`;
  const mixedLight = `hsl(${Math.round(avgBg.h / count)}, ${Math.round(avgBg.s / count)}%, 93%)`;
  
  return { bg: mixedBg, light: mixedLight };
}

export function getUserColorStyle(userId: string | null, guestName: string | null): React.CSSProperties {
  // Unassigned tasks get no special styling (gray default)
  if (!userId && !guestName) {
    return {};
  }
  
  const color = getUserColor(userId, guestName);
  return {
    borderLeftColor: color.bg,
    borderLeftWidth: '4px',
    backgroundColor: color.light,
  };
}

/**
 * User Color Assignment
 *
 * Assigns deterministic, consistent colors to users and guests.
 * Colors are cached by userId or guestName for session-stable assignments.
 */

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

export function getUserColorStyle(userId: string | null, guestName: string | null): Record<string, string> {
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

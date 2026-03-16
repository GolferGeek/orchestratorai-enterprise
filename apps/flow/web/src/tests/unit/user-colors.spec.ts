/**
 * user-colors.spec.ts
 *
 * Unit tests for getUserColor and getUserColorStyle from lib/user-colors.ts.
 *
 * The module keeps a module-level cache and counter so tests that rely on
 * deterministic index assignments must import fresh module instances.
 * For consistency tests (same key → same color) a single import is fine
 * because the cache persists across calls within a test.
 */

import { describe, it, expect } from 'vitest';
import { getUserColor, getUserColorStyle } from '@/lib/user-colors';

// ─── getUserColor ─────────────────────────────────────────────────────────────

describe('getUserColor', () => {
  it('returns consistent color for the same userId across multiple calls', () => {
    const first = getUserColor('user-abc', null);
    const second = getUserColor('user-abc', null);

    expect(first).toBe(second); // same object reference from cache
  });

  it('returns consistent color for the same guestName across multiple calls', () => {
    const first = getUserColor(null, 'Alice');
    const second = getUserColor(null, 'Alice');

    expect(first).toBe(second);
  });

  it('returns a color object (bg and light) when both userId and guestName are null', () => {
    const color = getUserColor(null, null);

    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('light');
    expect(typeof color.bg).toBe('string');
    expect(typeof color.light).toBe('string');
  });

  it('prefers userId over guestName as the cache key', () => {
    // When userId is set, guestName should be ignored for key selection.
    // The same userId should always yield the same color regardless of guestName.
    const withGuest = getUserColor('user-xyz', 'Bob');
    const withoutGuest = getUserColor('user-xyz', null);

    expect(withGuest).toBe(withoutGuest);
  });

  it('returns an object with non-empty bg and light strings', () => {
    const color = getUserColor('user-001', null);

    expect(color.bg.length).toBeGreaterThan(0);
    expect(color.light.length).toBeGreaterThan(0);
  });

  it('returns colors within the defined palette (bg starts with "hsl")', () => {
    const color = getUserColor('user-palette-check', null);

    expect(color.bg).toMatch(/^hsl\(/);
    expect(color.light).toMatch(/^hsl\(/);
  });

  it('can accommodate up to 8 different users with different color indices', () => {
    // Generate 8 distinct user IDs and collect their bg values.
    const bgs = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const color = getUserColor(`unique-user-color-test-${i}`, null);
      bgs.add(color.bg);
    }

    // We should see up to 8 distinct bg values (the full palette).
    // At minimum we expect more than 1 (i.e., not all the same).
    expect(bgs.size).toBeGreaterThan(1);
  });

  it('wraps around the palette when more than 8 unique keys are used', () => {
    // Create 9 unique users; the 9th must get a color from the palette
    // (no crash, valid color object returned).
    for (let i = 0; i < 9; i++) {
      const color = getUserColor(`wrap-test-user-${i}`, null);
      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('light');
    }
  });
});

// ─── getUserColorStyle ────────────────────────────────────────────────────────

describe('getUserColorStyle', () => {
  it('returns an empty object when both userId and guestName are null', () => {
    const style = getUserColorStyle(null, null);

    expect(style).toEqual({});
  });

  it('returns border and background style properties for a valid userId', () => {
    const style = getUserColorStyle('user-style-test', null);

    expect(style).toHaveProperty('borderLeftColor');
    expect(style).toHaveProperty('borderLeftWidth', '4px');
    expect(style).toHaveProperty('backgroundColor');
  });

  it('returns border and background style properties for a guestName when userId is null', () => {
    const style = getUserColorStyle(null, 'Charlie');

    expect(style).toHaveProperty('borderLeftColor');
    expect(style).toHaveProperty('borderLeftWidth', '4px');
    expect(style).toHaveProperty('backgroundColor');
  });

  it('borderLeftColor matches the bg color returned by getUserColor', () => {
    const userId = 'user-style-match';
    const color = getUserColor(userId, null);
    const style = getUserColorStyle(userId, null);

    expect(style['borderLeftColor']).toBe(color.bg);
  });

  it('backgroundColor matches the light color returned by getUserColor', () => {
    const userId = 'user-bg-match';
    const color = getUserColor(userId, null);
    const style = getUserColorStyle(userId, null);

    expect(style['backgroundColor']).toBe(color.light);
  });

  it('returns the same style for the same userId on repeated calls', () => {
    const style1 = getUserColorStyle('user-stable', null);
    const style2 = getUserColorStyle('user-stable', null);

    expect(style1).toEqual(style2);
  });
});

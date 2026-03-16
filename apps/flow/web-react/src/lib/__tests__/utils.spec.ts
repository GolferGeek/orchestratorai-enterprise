import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn utility', () => {
  it('should merge class names correctly', () => {
    const result = cn('px-2', 'py-1');
    expect(result).toBe('px-2 py-1');
  });

  it('should handle conditional classes', () => {
    const isActive = true;
    const result = cn('base-class', isActive && 'active-class');
    expect(result).toBe('base-class active-class');
  });

  it('should filter out falsy values', () => {
    const isFalsy = false;
    const result = cn('base', isFalsy && 'hidden', null, undefined, 'visible');
    expect(result).toBe('base visible');
  });

  it('should merge Tailwind classes correctly', () => {
    // twMerge should handle conflicting classes
    const result = cn('px-2 py-1', 'px-4');
    expect(result).toBe('py-1 px-4');
  });

  it('should handle array inputs', () => {
    const result = cn(['class1', 'class2']);
    expect(result).toBe('class1 class2');
  });

  it('should handle object inputs', () => {
    const result = cn({ active: true, disabled: false });
    expect(result).toBe('active');
  });

  it('should handle empty inputs', () => {
    const result = cn();
    expect(result).toBe('');
  });
});

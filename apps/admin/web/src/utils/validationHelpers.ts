/**
 * Validation Helper Utilities (Admin Web — simplified)
 */

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isNonEmpty(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value);
}

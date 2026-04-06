/**
 * API port assignments for all products.
 * Matches CLAUDE.md port table.
 */
export const API_PORTS = {
  auth: 5100,
  admin: 5150,
  forge: 5200,
  compose: 5300,
  pulse: 5500,
  bridge: 5600,
} as const;

export type Product = keyof typeof API_PORTS;

export function apiUrl(product: Product): string {
  return `http://localhost:${API_PORTS[product]}`;
}

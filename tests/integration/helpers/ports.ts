/**
 * API port assignments for all products.
 * Matches CLAUDE.md port table (Enterprise dev = 6xxx; Diviner = 7xxx).
 */
export const API_PORTS = {
  auth: 6100,
  admin: 6150,
  forge: 6200,
  compose: 6300,
  pulse: 6500,
  bridge: 6600,
} as const;

export type Product = keyof typeof API_PORTS;

export function apiUrl(product: Product): string {
  return `http://localhost:${API_PORTS[product]}`;
}

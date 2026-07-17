/** API port assignment for the unified platform API. */
export const API_PORTS = {
  platform: Number(process.env.PLATFORM_API_PORT ?? 6700),
} as const;

export type Product = keyof typeof API_PORTS;

export function apiUrl(product: Product): string {
  return `http://localhost:${API_PORTS[product]}`;
}

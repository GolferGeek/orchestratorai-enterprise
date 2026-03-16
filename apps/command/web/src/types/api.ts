// Minimal API types for the Command navigation shell
export type ApiVersion = 'v1' | 'v2';
export type ApiTechnology = 'typescript-nestjs';

export interface ApiEndpoint {
  version: ApiVersion;
  technology: ApiTechnology;
  baseUrl: string;
  name: string;
  description: string;
  features: string[];
  isAvailable: boolean;
}

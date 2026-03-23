import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

/**
 * ProductClientService — shared HTTP client for calling product APIs.
 *
 * Admin API is a pure aggregation gateway. It never accesses the database directly.
 * All data comes from calling the downstream product APIs using the token
 * passed in from the Admin Web request (pass-through auth).
 *
 * No fallbacks: if a product API returns an error, we propagate it.
 */
@Injectable()
export class ProductClientService {
  private readonly logger = new Logger(ProductClientService.name);

  private readonly forgeUrl: string;
  private readonly composeUrl: string;
  private readonly pulseUrl: string;
  private readonly bridgeUrl: string;
  private readonly authUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.forgeUrl = process.env['FORGE_API_URL'] ?? 'http://localhost:6200';
    this.composeUrl = process.env['COMPOSE_API_URL'] ?? 'http://localhost:6300';
    this.pulseUrl = process.env['PULSE_API_URL'] ?? 'http://localhost:6500';
    this.bridgeUrl = process.env['BRIDGE_API_URL'] ?? 'http://localhost:6600';
    this.authUrl = process.env['AUTH_API_URL'] ?? 'http://localhost:6100';
  }

  private buildHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private handleError(
    productName: string,
    path: string,
    error: unknown,
  ): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? 0;
      const message =
        (error.response?.data as { message?: string } | undefined)?.message ??
        error.message;
      this.logger.error(
        `[${productName}] ${path} failed with status ${status}: ${message}`,
      );
      throw new Error(
        `${productName} API error at ${path} (status ${status}): ${message}`,
      );
    }
    this.logger.error(`[${productName}] ${path} failed: ${String(error)}`);
    throw error;
  }

  // --- Forge API ---

  async forgeGet<T>(path: string, token: string): Promise<T> {
    const url = `${this.forgeUrl}${path}`;
    this.logger.debug(`[Forge] GET ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, { headers: this.buildHeaders(token) }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Forge', path, error);
    }
  }

  async forgePost<T>(path: string, token: string, body: unknown): Promise<T> {
    const url = `${this.forgeUrl}${path}`;
    this.logger.debug(`[Forge] POST ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, body, {
          headers: this.buildHeaders(token),
        }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Forge', path, error);
    }
  }

  async forgePut<T>(path: string, token: string, body: unknown): Promise<T> {
    const url = `${this.forgeUrl}${path}`;
    this.logger.debug(`[Forge] PUT ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, body, {
          headers: this.buildHeaders(token),
        }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Forge', path, error);
    }
  }

  // --- Compose API ---

  async composeGet<T>(path: string, token: string): Promise<T> {
    const url = `${this.composeUrl}${path}`;
    this.logger.debug(`[Compose] GET ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, { headers: this.buildHeaders(token) }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Compose', path, error);
    }
  }

  async composePost<T>(path: string, token: string, body: unknown): Promise<T> {
    const url = `${this.composeUrl}${path}`;
    this.logger.debug(`[Compose] POST ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, body, {
          headers: this.buildHeaders(token),
        }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Compose', path, error);
    }
  }

  async composeDelete<T>(path: string, token: string): Promise<T> {
    const url = `${this.composeUrl}${path}`;
    this.logger.debug(`[Compose] DELETE ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(url, { headers: this.buildHeaders(token) }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Compose', path, error);
    }
  }

  async composePut<T>(path: string, token: string, body: unknown): Promise<T> {
    const url = `${this.composeUrl}${path}`;
    this.logger.debug(`[Compose] PUT ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, body, {
          headers: this.buildHeaders(token),
        }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Compose', path, error);
    }
  }

  // --- Pulse API ---

  async pulseGet<T>(path: string, token: string): Promise<T> {
    const url = `${this.pulseUrl}${path}`;
    this.logger.debug(`[Pulse] GET ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, { headers: this.buildHeaders(token) }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Pulse', path, error);
    }
  }

  // --- Bridge API ---

  async bridgeGet<T>(path: string, token: string): Promise<T> {
    const url = `${this.bridgeUrl}${path}`;
    this.logger.debug(`[Bridge] GET ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, { headers: this.buildHeaders(token) }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Bridge', path, error);
    }
  }

  // --- Auth API ---

  async authGet<T>(path: string, token: string): Promise<T> {
    const url = `${this.authUrl}${path}`;
    this.logger.debug(`[Auth] GET ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, { headers: this.buildHeaders(token) }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Auth', path, error);
    }
  }

  async authPut<T>(path: string, token: string, body: unknown): Promise<T> {
    const url = `${this.authUrl}${path}`;
    this.logger.debug(`[Auth] PUT ${url}`);
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, body, {
          headers: this.buildHeaders(token),
        }),
      );
      return response.data;
    } catch (error) {
      return this.handleError('Auth', path, error);
    }
  }

  /**
   * Ping a product's health endpoint. Returns true if reachable, throws otherwise.
   */
  async ping(productUrl: string, productName: string): Promise<boolean> {
    const url = `${productUrl}/health`;
    this.logger.debug(`[${productName}] Pinging ${url}`);
    try {
      await firstValueFrom(
        this.httpService.get<unknown>(url, { timeout: 5000 }),
      );
      return true;
    } catch (error) {
      this.logger.warn(`[${productName}] Health ping failed: ${String(error)}`);
      throw new Error(
        `${productName} API is unreachable at ${url}: ${String(error)}`,
      );
    }
  }

  getProductUrls(): Record<string, string> {
    return {
      forge: this.forgeUrl,
      compose: this.composeUrl,
      pulse: this.pulseUrl,
      bridge: this.bridgeUrl,
      auth: this.authUrl,
    };
  }
}

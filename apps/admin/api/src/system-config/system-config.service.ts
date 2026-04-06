import { Injectable, Logger } from '@nestjs/common';
import { ProductClientService } from '../common/product-client.service';

export interface SystemConfig {
  key: string;
  value: unknown;
  description: string;
  updatedAt: string;
}

export interface SystemConfigResponse {
  config: SystemConfig[];
}

export interface UpdateSystemConfigDto {
  key: string;
  value: unknown;
}

export interface ProductHealthStatus {
  product: string;
  displayName: string;
  apiPort: number | null;
  webPort: number | null;
  apiStatus: 'healthy' | 'down' | 'unknown';
  webStatus: 'healthy' | 'down' | 'unknown';
  responseTimeMs: number | null;
  lastCheckedAt: string;
  message: string | null;
}

const PRODUCT_META: Record<string, { displayName: string; apiPort: number | null; webPort: number | null }> = {
  forge:   { displayName: 'Forge',   apiPort: 5200, webPort: 5201 },
  compose: { displayName: 'Compose', apiPort: 5300, webPort: 5301 },
  pulse:   { displayName: 'Pulse',   apiPort: 5500, webPort: 5501 },
  bridge:  { displayName: 'Bridge',  apiPort: 5600, webPort: 5601 },
  auth:    { displayName: 'Auth',    apiPort: 5100, webPort: null },
};

export interface SystemHealthResponse {
  products: ProductHealthStatus[];
  overallStatus: 'healthy' | 'degraded' | 'down';
  checkedAt: string;
}

/**
 * SystemConfigService — manages system-wide configuration and pings all product APIs.
 *
 * Configuration is managed via Auth API.
 * Health checks ping each product's /health endpoint.
 * No fallbacks: product config errors propagate. Health check marks products as unreachable.
 */
@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(private readonly productClient: ProductClientService) {}

  async getConfig(token: string): Promise<SystemConfigResponse> {
    this.logger.log('[SystemConfig] Fetching system config from Auth API');
    return this.productClient.authGet<SystemConfigResponse>(
      '/admin/system/config',
      token,
    );
  }

  async updateConfig(
    token: string,
    dto: UpdateSystemConfigDto,
  ): Promise<SystemConfig> {
    this.logger.log(
      `[SystemConfig] Updating system config key "${dto.key}" via Auth API`,
    );
    return this.productClient.authPut<SystemConfig>(
      '/admin/system/config',
      token,
      dto,
    );
  }

  async getHealth(): Promise<SystemHealthResponse> {
    this.logger.log('[SystemConfig] Pinging all product APIs for health check');

    const productUrls = this.productClient.getProductUrls();
    const checkedAt = new Date().toISOString();

    const pingResults = await Promise.allSettled(
      Object.entries(productUrls).map(async ([productName, url]) => {
        const start = Date.now();
        await this.productClient.ping(url, productName);
        const responseTimeMs = Date.now() - start;
        return { product: productName, responseTimeMs };
      }),
    );

    const products: ProductHealthStatus[] = pingResults.map((result, idx) => {
      const entries = Object.entries(productUrls);
      const [productName] = entries[idx]!;
      const meta = PRODUCT_META[productName] ?? { displayName: productName, apiPort: null, webPort: null };

      if (result.status === 'fulfilled') {
        return {
          product: productName,
          displayName: meta.displayName,
          apiPort: meta.apiPort,
          webPort: meta.webPort,
          apiStatus: 'healthy' as const,
          webStatus: meta.webPort ? 'unknown' as const : 'unknown' as const,
          responseTimeMs: result.value.responseTimeMs,
          lastCheckedAt: checkedAt,
          message: null,
        };
      }
      return {
        product: productName,
        displayName: meta.displayName,
        apiPort: meta.apiPort,
        webPort: meta.webPort,
        apiStatus: 'down' as const,
        webStatus: 'unknown' as const,
        responseTimeMs: null,
        lastCheckedAt: checkedAt,
        message: result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      };
    });

    const healthyCount = products.filter((p) => p.apiStatus === 'healthy').length;
    const total = products.length;

    let overallStatus: 'healthy' | 'degraded' | 'down';
    if (healthyCount === total) {
      overallStatus = 'healthy';
    } else if (healthyCount === 0) {
      overallStatus = 'down';
    } else {
      overallStatus = 'degraded';
    }

    return {
      products,
      overallStatus,
      checkedAt,
    };
  }
}

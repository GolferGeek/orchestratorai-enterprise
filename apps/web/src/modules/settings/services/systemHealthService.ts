import { platformApiClient } from '@/shared/services/api-client';

export type PlatformHealthStatus = 'healthy';

interface HealthResponse {
  status: 'ok';
  service: 'platform-api';
}

export interface PlatformServiceHealth {
  service: 'platform-api';
  displayName: string;
  status: PlatformHealthStatus;
  apiPrefix: '/health';
  responseTimeMs: number;
  message: string;
}

export interface PlatformHealthReport {
  overallStatus: PlatformHealthStatus;
  checkedAt: string;
  services: PlatformServiceHealth[];
}

class SystemHealthService {
  async getSystemHealth(): Promise<PlatformHealthReport> {
    const startedAt = performance.now();
    const response = await platformApiClient.get<HealthResponse>('/health');
    const responseTimeMs = Math.round(performance.now() - startedAt);

    return {
      overallStatus: 'healthy',
      checkedAt: new Date().toISOString(),
      services: [
        {
          service: response.service,
          displayName: 'Platform API',
          status: 'healthy',
          apiPrefix: '/health',
          responseTimeMs,
          message: `Health endpoint returned ${response.status}.`,
        },
      ],
    };
  }
}

export const systemHealthService = new SystemHealthService();

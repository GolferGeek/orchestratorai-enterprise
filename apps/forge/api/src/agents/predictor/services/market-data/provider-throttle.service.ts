import { Injectable, Logger } from '@nestjs/common';

type ProviderKey = 'polygon' | 'coinmarketcap' | 'polymarket';

@Injectable()
export class ProviderThrottleService {
  private readonly logger = new Logger(ProviderThrottleService.name);
  private readonly providerNextRequestAt: Record<string, number> = {};

  private getProviderMinIntervalMs(provider: ProviderKey): number {
    switch (provider) {
      case 'polygon':
        return 15000;
      case 'coinmarketcap':
        return 3000;
      case 'polymarket':
        return 10000;
    }
  }

  private getProviderRetryDelayMs(provider: ProviderKey): number {
    switch (provider) {
      case 'polygon':
        return 60000;
      case 'coinmarketcap':
        return 30000;
      case 'polymarket':
        return 60000;
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async waitForProviderSlot(provider: ProviderKey): Promise<void> {
    const now = Date.now();
    const nextAllowed = this.providerNextRequestAt[provider] ?? 0;
    if (nextAllowed > now) {
      await this.sleep(nextAllowed - now);
    }
  }

  private parseRetryAfterMs(
    retryAfterHeader: string | null,
    provider: ProviderKey,
  ): number {
    if (!retryAfterHeader) {
      return this.getProviderRetryDelayMs(provider);
    }

    const retrySeconds = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
      return retrySeconds * 1000;
    }

    return this.getProviderRetryDelayMs(provider);
  }

  async fetchWithProviderThrottle(
    provider: ProviderKey,
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    await this.waitForProviderSlot(provider);

    let response = await fetch(url, init);
    this.providerNextRequestAt[provider] =
      Date.now() + this.getProviderMinIntervalMs(provider);

    if (response.status !== 429) {
      return response;
    }

    const retryDelayMs = this.parseRetryAfterMs(
      response.headers.get('retry-after'),
      provider,
    );
    this.logger.warn(
      `${provider} rate-limited request (429). Retrying once after ${retryDelayMs}ms`,
    );

    await this.sleep(retryDelayMs);
    response = await fetch(url, init);
    this.providerNextRequestAt[provider] =
      Date.now() + this.getProviderMinIntervalMs(provider);
    return response;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import { MachineIdentityProvider } from './machine-identity.interface';

interface TailscaleStatus {
  Self: {
    ID: string;
    HostName: string;
  };
}

@Injectable()
export class TailscaleMachineIdentityProvider implements MachineIdentityProvider {
  private readonly logger = new Logger(TailscaleMachineIdentityProvider.name);

  private cachedStatus: TailscaleStatus | null = null;
  private cacheExpiresAt = 0;
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  private getStatus(): TailscaleStatus {
    const now = Date.now();
    if (this.cachedStatus && now < this.cacheExpiresAt) {
      return this.cachedStatus;
    }

    const output = execSync('tailscale status --json', {
      encoding: 'utf8',
      timeout: 5000,
    });

    const parsed = JSON.parse(output) as TailscaleStatus;
    if (!parsed.Self?.ID || !parsed.Self?.HostName) {
      throw new Error('tailscale status --json response missing Self.ID or Self.HostName');
    }

    this.cachedStatus = parsed;
    this.cacheExpiresAt = now + this.cacheTtlMs;
    return this.cachedStatus;
  }

  async getIdentityString(): Promise<string> {
    try {
      const status = this.getStatus();
      return `tailscale:${status.Self.ID}`;
    } catch (err) {
      this.logger.warn(`tailscale not available, could not build identity string: ${String(err)}`);
      throw err;
    }
  }

  async getNodeId(): Promise<string> {
    try {
      const status = this.getStatus();
      return status.Self.ID;
    } catch (err) {
      this.logger.warn(`tailscale not available, could not retrieve node ID: ${String(err)}`);
      throw err;
    }
  }

  async getHostName(): Promise<string> {
    try {
      const status = this.getStatus();
      return status.Self.HostName;
    } catch (err) {
      this.logger.warn(`tailscale not available, could not retrieve hostname: ${String(err)}`);
      throw err;
    }
  }
}

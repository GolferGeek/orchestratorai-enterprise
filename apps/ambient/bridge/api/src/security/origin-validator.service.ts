import { Injectable, Logger } from '@nestjs/common';

/**
 * OriginValidatorService — Origin validation for external A2A requests.
 *
 * Bridge maintains an allowlist of trusted external agent origins.
 * Requests from unknown origins are rejected at the boundary.
 * Origin rules can be configured via environment or updated at runtime
 * through the external agent registry.
 */
@Injectable()
export class OriginValidatorService {
  private readonly logger = new Logger(OriginValidatorService.name);

  /** Registered trusted origins — populated from env and registry */
  private trustedOrigins: Set<string> = new Set(
    (process.env.TRUSTED_ORIGINS ?? '').split(',').filter(Boolean),
  );

  /**
   * Check if the given origin is trusted.
   * In permissive mode (ORIGIN_VALIDATION=permissive), all origins pass with a warning.
   * In strict mode (default), only allowlisted origins pass.
   */
  isOriginTrusted(origin: string): boolean {
    const mode = process.env.ORIGIN_VALIDATION ?? 'strict';

    if (mode === 'permissive') {
      if (!this.trustedOrigins.has(origin)) {
        this.logger.warn(`Unknown origin ${origin} allowed (permissive mode)`);
      }
      return true;
    }

    // Strict mode: origin must be in trusted set
    const trusted = this.trustedOrigins.has(origin) || this.trustedOrigins.has('*');
    if (!trusted) {
      this.logger.warn(`Rejected request from untrusted origin: ${origin}`);
    }
    return trusted;
  }

  /**
   * Register a trusted origin (called when a new external agent is registered).
   */
  addTrustedOrigin(origin: string): void {
    this.trustedOrigins.add(origin);
    this.logger.log(`Added trusted origin: ${origin}`);
  }

  /**
   * Remove a trusted origin (called when an external agent is deregistered).
   */
  removeTrustedOrigin(origin: string): void {
    this.trustedOrigins.delete(origin);
    this.logger.log(`Removed trusted origin: ${origin}`);
  }

  getTrustedOrigins(): string[] {
    return Array.from(this.trustedOrigins);
  }
}

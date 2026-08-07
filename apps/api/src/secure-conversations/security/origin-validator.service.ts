import { Injectable, Logger } from '@nestjs/common';

/**
 * OriginValidatorService — Origin validation for external A2A requests.
 *
 * Secure Conversations maintains an allowlist of trusted external agent origins.
 * Requests from unknown origins are rejected at the boundary.
 * Origin rules can be configured via environment or updated at runtime
 * through the external agent registry.
 */
@Injectable()
export class OriginValidatorService {
  private readonly logger = new Logger(OriginValidatorService.name);

  /** Registered trusted origins — populated from env and registry */
  private trustedOrigins: Set<string> = new Set(
    (process.env.TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((origin) => this.normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  );

  /**
   * Check if the given origin is trusted.
   * In permissive mode (ORIGIN_VALIDATION=permissive), all origins pass with a warning.
   * In strict mode (default), only allowlisted origins pass.
   */
  isOriginTrusted(origin: string): boolean {
    const mode = process.env.ORIGIN_VALIDATION ?? 'strict';

    if (mode === 'permissive') {
      const normalizedOrigin = this.normalizeOrigin(origin);
      if (!normalizedOrigin || !this.trustedOrigins.has(normalizedOrigin)) {
        this.logger.warn(`Unknown origin ${origin} allowed (permissive mode)`);
      }
      return true;
    }

    if (mode !== 'strict') {
      this.logger.error(`Invalid ORIGIN_VALIDATION mode: ${mode}`);
      return false;
    }

    // Strict mode: origin must be in trusted set
    const normalizedOrigin = this.normalizeOrigin(origin);
    const trusted =
      normalizedOrigin !== null && this.trustedOrigins.has(normalizedOrigin);
    if (!trusted) {
      this.logger.warn(`Rejected request from untrusted origin: ${origin}`);
    }
    return trusted;
  }

  /**
   * Register a trusted origin (called when a new external agent is registered).
   */
  addTrustedOrigin(origin: string): void {
    const normalizedOrigin = this.normalizeOrigin(origin);
    if (!normalizedOrigin) {
      throw new Error('Trusted origin must be a valid HTTP or HTTPS origin');
    }
    this.trustedOrigins.add(normalizedOrigin);
    this.logger.log(`Added trusted origin: ${normalizedOrigin}`);
  }

  /**
   * Remove a trusted origin (called when an external agent is deregistered).
   */
  removeTrustedOrigin(origin: string): void {
    const normalizedOrigin = this.normalizeOrigin(origin);
    if (normalizedOrigin) {
      this.trustedOrigins.delete(normalizedOrigin);
      this.logger.log(`Removed trusted origin: ${normalizedOrigin}`);
    }
  }

  getTrustedOrigins(): string[] {
    return Array.from(this.trustedOrigins);
  }

  private normalizeOrigin(rawOrigin: string): string | null {
    const candidate = rawOrigin.trim();
    if (!candidate || candidate === '*') {
      return null;
    }
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }
      return url.origin;
    } catch {
      return null;
    }
  }
}

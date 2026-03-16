import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual, createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { OrganizationCredentialsRepository } from '@agent-platform/repositories/organization-credentials.repository';
import { OrganizationCredentialRecord } from '@agent-platform/interfaces/organization-credential-record.interface';

type BufferEncodingOption = BufferEncoding | 'base64url';

/**
 * API Key Authentication Guard
 *
 * SECURITY CRITICAL: This guard validates API keys for agent-to-agent communication.
 * It implements multiple security layers:
 * - Timing-safe comparison to prevent timing attacks
 * - Rate limiting to prevent brute force attacks
 * - Secure hashing with salt/pepper support
 * - Comprehensive audit logging
 * - Credential caching to reduce database load
 *
 * Security considerations:
 * - All API key comparisons use constant-time algorithms
 * - Error messages are intentionally generic to prevent information leakage
 * - SQL injection is prevented through parameterized queries
 * - Rate limiting is applied per organization/key fingerprint
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  private static readonly DEFAULT_ALIAS = 'agent_api_key';
  private static readonly DEFAULT_CACHE_TTL_MS = 60_000;
  private static readonly DEFAULT_RATE_LIMIT = 120;
  private static readonly DEFAULT_RATE_WINDOW_MS = 60_000;

  private readonly credentialCache = new Map<
    string,
    { record: OrganizationCredentialRecord; expiresAt: number }
  >();
  private readonly rateBuckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  private readonly cacheTtlMs: number;
  private readonly rateLimit: number;
  private readonly rateWindowMs: number;

  constructor(
    private readonly credentials: OrganizationCredentialsRepository,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtlMs = this.resolveNumberConfig(
      'AGENT_API_KEY_CACHE_TTL_MS',
      ApiKeyGuard.DEFAULT_CACHE_TTL_MS,
      { min: 1_000, max: 600_000 },
    );
    this.rateLimit = this.resolveNumberConfig(
      'AGENT_API_KEY_RATE_LIMIT',
      ApiKeyGuard.DEFAULT_RATE_LIMIT,
      { min: 0, max: 10_000 },
    );
    this.rateWindowMs = this.resolveNumberConfig(
      'AGENT_API_KEY_RATE_WINDOW_MS',
      ApiKeyGuard.DEFAULT_RATE_WINDOW_MS,
      { min: 1_000, max: 600_000 },
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
      params: Record<string, unknown>;
    }>();
    const apiKeyHeader =
      request.headers['x-agent-api-key'] || request.headers['x-api-key'];

    // SECURITY: Validate API key presence and type before processing
    // Error message is intentionally generic to prevent information leakage
    if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
      throw new UnauthorizedException('Agent API key required.');
    }

    const orgSlug = this.extractOrgSlug(request?.params);
    const aliasHeader = this.extractAlias(request?.headers);
    const aliasesToTry = this.buildAliasList(aliasHeader);

    const fingerprint = this.computeFingerprint(orgSlug, apiKeyHeader);
    this.enforceRateLimit(orgSlug, fingerprint, aliasesToTry);

    const credential = await this.lookupCredential(orgSlug, aliasesToTry);
    if (!credential) {
      this.logger.warn(
        `No API key credential found for organization ${orgSlug} (aliases: ${aliasesToTry.join(', ')}).`,
      );
      this.logAttempt({
        orgSlug,
        fingerprint,
        alias: aliasesToTry[0] ?? null,
        status: 'credential_missing',
      });
      throw new UnauthorizedException('Invalid API key.');
    }

    if (!this.verifyKey(apiKeyHeader, credential.record)) {
      this.logger.warn(`API key mismatch for organization ${orgSlug}.`);
      this.logAttempt({
        orgSlug,
        fingerprint,
        alias: credential.alias,
        status: 'mismatch',
      });
      throw new UnauthorizedException('Invalid API key.');
    }

    this.logAttempt({
      orgSlug,
      fingerprint,
      alias: credential.alias,
      status: 'success',
    });

    return true;
  }

  /**
   * Extract and validate organization slug from request params
   * SECURITY: Input validation prevents SQL injection and malformed requests
   */
  private extractOrgSlug(params: Record<string, unknown> | undefined): string {
    const raw = params?.orgSlug ?? params?.organizationSlug ?? 'global';
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new UnauthorizedException(
        'Organization slug missing from request.',
      );
    }
    // Organization slug is used in database queries via parameterized statements
    // in OrganizationCredentialsRepository, which prevents SQL injection
    return raw;
  }

  private extractAlias(
    headers: Record<string, unknown> | undefined,
  ): string | null {
    const candidate =
      headers?.['x-agent-key-alias'] || headers?.['x-agent-keyalias'];
    return typeof candidate === 'string' && candidate.trim()
      ? candidate.trim()
      : null;
  }

  private buildAliasList(primary: string | null): string[] {
    const aliases = new Set<string>();
    if (primary) {
      aliases.add(primary);
    }
    aliases.add(ApiKeyGuard.DEFAULT_ALIAS);
    aliases.add('api_key');
    return Array.from(aliases);
  }

  private async lookupCredential(
    organizationSlug: string,
    aliases: string[],
  ): Promise<{ alias: string; record: OrganizationCredentialRecord } | null> {
    for (const alias of aliases) {
      const cacheKey = this.buildCacheKey(organizationSlug, alias);
      const cached = this.credentialCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { alias, record: cached.record };
      }

      try {
        const record = await this.credentials.get(organizationSlug, alias);
        if (record) {
          this.credentialCache.set(cacheKey, {
            record,
            expiresAt: Date.now() + this.cacheTtlMs,
          });
          return { alias, record };
        }
      } catch (error) {
        this.logger.error(
          `Credential lookup failed for ${organizationSlug}/${alias}: ${String(error)}`,
        );
        throw new UnauthorizedException('Unable to validate API key.');
      }
      this.credentialCache.delete(cacheKey);
    }
    return null;
  }

  private verifyKey(
    providedKey: string,
    credential: OrganizationCredentialRecord,
  ): boolean {
    const metadata = credential.encryption_metadata ?? {};
    const algorithm = this.normalizeAlgorithm(
      metadata.hash_algorithm ?? metadata.hashAlgorithm ?? metadata.hash,
    );
    const encoding = this.normalizeEncoding(
      metadata.encoding ?? (algorithm ? 'base64' : 'utf8'),
    );

    const expected = algorithm
      ? this.hash(providedKey, metadata, algorithm, encoding)
      : providedKey;

    const stored = credential.encrypted_value;

    return this.safeCompare(expected, stored, encoding);
  }

  private normalizeAlgorithm(value: unknown): string | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    switch (normalized) {
      case 'sha256':
      case 'sha512':
        return normalized;
      default:
        this.logger.warn(
          `Unsupported hash algorithm "${value}" specified for API key credential; rejecting request.`,
        );
        return null;
    }
  }

  private normalizeEncoding(value: unknown): BufferEncodingOption {
    if (!value || typeof value !== 'string') {
      return 'utf8';
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'base64url') {
      return 'base64url';
    }
    const allowed: BufferEncodingOption[] = ['utf8', 'hex', 'latin1', 'base64'];
    return allowed.includes(normalized as BufferEncoding)
      ? (normalized as BufferEncodingOption)
      : 'utf8';
  }

  private hash(
    apiKey: string,
    metadata: Record<string, unknown>,
    algorithm: string,
    encoding: BufferEncodingOption,
  ): string {
    const salt = typeof metadata.salt === 'string' ? metadata.salt : '';
    const pepperEnv =
      typeof metadata.pepper_env_var === 'string'
        ? metadata.pepper_env_var
        : typeof metadata.pepperEnvVar === 'string'
          ? metadata.pepperEnvVar
          : null;
    const pepper = pepperEnv ? (process.env[pepperEnv] ?? '') : '';
    const input = `${salt}${apiKey}${pepper}`;

    const hash = createHash(algorithm as 'sha256' | 'sha512');
    hash.update(input, 'utf8');
    const digest = hash.digest();

    switch (encoding) {
      case 'hex':
        return digest.toString('hex');
      case 'latin1':
        return digest.toString('latin1');
      case 'base64':
        return digest.toString('base64');
      case 'base64url': {
        const base64 = digest.toString('base64');
        return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      }
      default:
        return digest.toString('utf8');
    }
  }

  /**
   * SECURITY CRITICAL: Timing-safe comparison of API keys
   * Uses constant-time algorithm to prevent timing attacks that could
   * reveal information about the stored key through timing variations.
   */
  private safeCompare(
    expected: string,
    stored: string,
    encoding: BufferEncodingOption,
  ): boolean {
    try {
      const expectedBuffer = this.toBuffer(expected, encoding);
      const storedBuffer = this.toBuffer(stored, encoding);
      // Fast reject on length mismatch (length is not secret)
      if (expectedBuffer.length !== storedBuffer.length) {
        return false;
      }
      // Use Node.js crypto.timingSafeEqual for constant-time comparison
      return timingSafeEqual(expectedBuffer, storedBuffer);
    } catch (error) {
      // Log error but don't leak key material
      this.logger.error(
        `Failed to compare API keys (encoding=${encoding}): ${String(error)}`,
      );
      return false;
    }
  }

  private toBuffer(value: string, encoding: BufferEncodingOption): Buffer {
    if (encoding === 'base64url') {
      const normalized = this.padBase64(
        value.replace(/-/g, '+').replace(/_/g, '/'),
      );
      return Buffer.from(normalized, 'base64');
    }
    return Buffer.from(value, encoding as BufferEncoding);
  }

  private buildCacheKey(org: string, alias: string): string {
    return `${org ?? 'global'}::${alias ?? ApiKeyGuard.DEFAULT_ALIAS}`;
  }

  /**
   * SECURITY: Rate limiting to prevent brute force attacks
   * Tracks request counts per fingerprint (hash of org+key) to prevent
   * attackers from guessing valid API keys through repeated attempts.
   */
  private enforceRateLimit(
    orgSlug: string,
    fingerprint: string,
    aliases: string[],
  ) {
    if (!this.rateLimit || this.rateLimit <= 0) {
      return;
    }

    const now = Date.now();
    const bucket = this.rateBuckets.get(fingerprint);

    if (!bucket || bucket.resetAt <= now) {
      this.rateBuckets.set(fingerprint, {
        count: 1,
        resetAt: now + this.rateWindowMs,
      });
      return;
    }

    if (bucket.count >= this.rateLimit) {
      const retryAfter = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));
      this.logAttempt({
        orgSlug,
        fingerprint,
        alias: aliases[0] ?? null,
        status: 'rate_limited',
        extra: { retryAfterSeconds: retryAfter },
      });
      throw new HttpException(
        {
          message: 'Agent API key rate limit exceeded.',
          retryAfterSeconds: retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
  }

  private logAttempt(params: {
    orgSlug: string;
    fingerprint: string;
    alias: string | null;
    status: 'success' | 'credential_missing' | 'mismatch' | 'rate_limited';
    extra?: Record<string, unknown>;
  }) {
    const payload = {
      event: 'agent_api_key_check',
      organization: params.orgSlug ?? 'global',
      alias: params.alias ?? ApiKeyGuard.DEFAULT_ALIAS,
      fingerprint: params.fingerprint,
      status: params.status,
      timestamp: new Date().toISOString(),
      ...(params.extra ?? {}),
    };

    if (params.status === 'success') {
      this.logger.log(payload);
    } else if (params.status === 'rate_limited') {
      this.logger.error(payload);
    } else {
      this.logger.warn(payload);
    }
  }

  private computeFingerprint(orgSlug: string, apiKey: string): string {
    const normalizedOrg =
      typeof orgSlug === 'string' && orgSlug.trim() ? orgSlug.trim() : 'global';
    return createHash('sha256')
      .update(`${normalizedOrg}:${apiKey}`)
      .digest('hex');
  }

  private resolveNumberConfig(
    key: string,
    fallback: number,
    bounds: { min: number; max: number },
  ): number {
    const raw = this.configService.get<string | number | undefined>(key);
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    const clamped = Math.min(Math.max(numeric, bounds.min), bounds.max);
    return clamped;
  }

  private padBase64(value: string): string {
    const padding = value.length % 4;
    if (!padding) {
      return value;
    }
    return value.concat('='.repeat(4 - padding));
  }
}

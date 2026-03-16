/**
 * Optional JWT Auth Guard for Agent Communication APIs.
 *
 * When AUTH_ENABLED=true, validates JWT tokens from the Authorization: Bearer header.
 * Supports both HS256 (SUPABASE_JWT_SECRET) and ES256 (JWKS from Supabase Auth).
 *
 * When AUTH_ENABLED is not set or false, all requests pass through (dev mode).
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as http from 'http';

/** Paths that are always public regardless of auth configuration. */
const PUBLIC_PATHS = ['/health', '/.well-known'];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

function base64UrlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

function decodeJwtParts(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; headerB64: string; payloadB64: string; signatureB64: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('Malformed JWT: expected 3 parts');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf-8'));
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8')) as Record<string, unknown>;
  return { header, payload, headerB64, payloadB64, signatureB64 };
}

function checkExpiration(payload: Record<string, unknown>): void {
  if (typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) {
      throw new UnauthorizedException('JWT has expired');
    }
  }
}

function verifyHs256(token: string, secret: string): Record<string, unknown> {
  const { header, payload, headerB64, payloadB64, signatureB64 } = decodeJwtParts(token);

  if (header.alg !== 'HS256') {
    throw new UnauthorizedException(`Expected HS256 but got ${header.alg}`);
  }

  const signatureInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest();
  const actualSignature = base64UrlDecode(signatureB64);

  if (!crypto.timingSafeEqual(expectedSignature, actualSignature)) {
    throw new UnauthorizedException('Invalid JWT signature');
  }

  checkExpiration(payload);
  return payload;
}

/** Cached ES256 public key from JWKS */
let cachedEs256Key: crypto.KeyObject | null = null;
let jwksFetchPromise: Promise<void> | null = null;

function fetchJwks(): Promise<void> {
  if (jwksFetchPromise) return jwksFetchPromise;

  const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:6010';
  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;

  jwksFetchPromise = new Promise<void>((resolve, reject) => {
    const url = new URL(jwksUrl);
    http.get({ hostname: url.hostname, port: url.port, path: url.pathname }, (res) => {
      let body = '';
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => {
        try {
          const jwks = JSON.parse(body);
          const es256Key = jwks.keys?.find((k: Record<string, unknown>) => k.alg === 'ES256' && k.kty === 'EC');
          if (es256Key) {
            cachedEs256Key = crypto.createPublicKey({ key: es256Key, format: 'jwk' });
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });

  // Clear promise after resolution so it can be retried on failure
  jwksFetchPromise.catch(() => { jwksFetchPromise = null; });

  return jwksFetchPromise;
}

function verifyEs256Sync(token: string): Record<string, unknown> {
  if (!cachedEs256Key) {
    throw new UnauthorizedException('ES256 public key not available — JWKS not loaded');
  }

  const { header, payload, headerB64, payloadB64, signatureB64 } = decodeJwtParts(token);

  if (header.alg !== 'ES256') {
    throw new UnauthorizedException(`Expected ES256 but got ${header.alg}`);
  }

  const signatureInput = `${headerB64}.${payloadB64}`;

  // ES256 JWT signatures are raw R||S (64 bytes), need to convert to DER for Node crypto
  const rawSig = base64UrlDecode(signatureB64);
  const r = rawSig.subarray(0, 32);
  const s = rawSig.subarray(32, 64);

  // Build DER-encoded signature
  function derEncodeInteger(buf: Buffer): Buffer {
    // Strip leading zeros, but ensure high bit is not set (add 0x00 pad if needed)
    let start = 0;
    while (start < buf.length - 1 && buf[start] === 0) start++;
    const trimmed = buf.subarray(start);
    const needsPad = trimmed[0] >= 0x80;
    const len = trimmed.length + (needsPad ? 1 : 0);
    const der = Buffer.alloc(2 + len);
    der[0] = 0x02; // INTEGER tag
    der[1] = len;
    if (needsPad) {
      der[2] = 0x00;
      trimmed.copy(der, 3);
    } else {
      trimmed.copy(der, 2);
    }
    return der;
  }

  const derR = derEncodeInteger(r);
  const derS = derEncodeInteger(s);
  const derSig = Buffer.concat([
    Buffer.from([0x30, derR.length + derS.length]),
    derR,
    derS,
  ]);

  const isValid = crypto.verify('SHA256', Buffer.from(signatureInput), cachedEs256Key, derSig);
  if (!isValid) {
    throw new UnauthorizedException('Invalid ES256 JWT signature');
  }

  checkExpiration(payload);
  return payload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwksLoaded = false;

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    if (process.env.AUTH_ENABLED !== 'true') {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const path: string = request.url?.split('?')[0] || '';

    if (isPublicPath(path)) {
      return true;
    }

    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);
    const { header } = decodeJwtParts(token);

    if (header.alg === 'HS256') {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) {
        throw new UnauthorizedException('AUTH_ENABLED is true but SUPABASE_JWT_SECRET is not set');
      }
      verifyHs256(token, secret);
      return true;
    }

    if (header.alg === 'ES256') {
      if (cachedEs256Key) {
        verifyEs256Sync(token);
        return true;
      }

      // Need to fetch JWKS first, then verify
      return fetchJwks().then(() => {
        verifyEs256Sync(token);
        return true;
      });
    }

    throw new UnauthorizedException(`Unsupported JWT algorithm: ${header.alg}`);
  }
}

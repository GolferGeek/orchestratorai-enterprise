import * as crypto from 'crypto';
import { IIdentityProvider, AgentIdentity } from '../identity.interface';

interface A2ASecuritySchemes {
  [key: string]: {
    type: string;
    description: string;
    scheme?: string;
    bearerFormat?: string;
    flows?: Record<string, unknown>;
  };
}

export class OAuthJWTIdentityProvider implements IIdentityProvider {
  readonly providerId = 'oauth-jwt';

  private privateKeyPem: string | null = null;
  private clients: Map<string, AgentIdentity> = new Map();

  async generateIdentity(): Promise<AgentIdentity> {
    const clientId = `client_${crypto.randomBytes(16).toString('hex')}`;

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    this.privateKeyPem = privateKey;

    const identity: AgentIdentity & {
      metadata?: Record<string, unknown>;
      securitySchemes?: A2ASecuritySchemes;
    } = {
      id: clientId,
      publicKey: publicKey,
      algorithm: 'RS256',
      createdAt: new Date().toISOString(),
      securitySchemes: this.buildSecuritySchemes(clientId),
      metadata: {
        identityProvider: 'oauth-jwt',
        a2aSecuritySchemes: this.buildSecuritySchemes(clientId),
      },
    };

    this.clients.set(clientId, identity);
    return identity;
  }

  async sign(message: string): Promise<string> {
    if (!this.privateKeyPem) {
      throw new Error('No identity generated. Call generateIdentity() first.');
    }

    const header = this.toBase64Url(JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
    }));

    const payload = this.toBase64Url(JSON.stringify({
      sub: message,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: crypto.randomUUID(),
    }));

    const signingInput = `${header}.${payload}`;
    const signatureBuffer = crypto.sign('sha256', Buffer.from(signingInput), this.privateKeyPem);
    const signature = signatureBuffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${header}.${payload}.${signature}`;
  }

  async verify(message: string, signature: string, publicKey: string): Promise<boolean> {
    const parts = signature.split('.');
    if (parts.length !== 3) {
      return false;
    }

    const [header, payload, sig] = parts;
    const signingInput = `${header}.${payload}`;
    const signatureBuffer = Buffer.from(this.fromBase64Url(sig), 'base64');

    let cryptoValid: boolean;
    try {
      cryptoValid = crypto.verify('sha256', Buffer.from(signingInput), publicKey, signatureBuffer);
    } catch {
      return false;
    }

    if (!cryptoValid) {
      return false;
    }

    // Verify the subject matches the message
    try {
      const payloadJson = JSON.parse(Buffer.from(this.fromBase64Url(payload), 'base64').toString('utf8'));
      return payloadJson.sub === message;
    } catch {
      return false;
    }
  }

  async resolveIdentity(id: string): Promise<AgentIdentity | null> {
    return this.clients.get(id) ?? null;
  }

  getSecuritySchemes(clientId?: string): A2ASecuritySchemes {
    return this.buildSecuritySchemes(clientId);
  }

  private toBase64Url(data: string): string {
    return Buffer.from(data)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private fromBase64Url(data: string): string {
    // Convert base64url back to standard base64
    let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding === 2) base64 += '==';
    else if (padding === 3) base64 += '=';
    return base64;
  }

  private buildSecuritySchemes(clientId?: string): A2ASecuritySchemes {
    return {
      oauth_jwt: {
        type: 'oauth2',
        description: 'OAuth 2.0 bearer JWT for A2A transport authorization',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        flows: {
          clientCredentials: {
            tokenUrl: '/oauth/token',
            scopes: {
              'a2a:invoke': 'Invoke A2A methods',
              'a2a:stream': 'Use A2A SSE stream mode',
            },
            ...(clientId ? { clientId } : {}),
          },
        },
      },
    };
  }
}

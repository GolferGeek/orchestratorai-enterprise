import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
]);

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [a, b] = octets;
  if (a === undefined) {
    return true;
  }
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export function isPrivateNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? address;
  const version = isIP(normalized);

  if (version === 4) {
    return isPrivateIpv4(normalized);
  }

  if (version === 6) {
    if (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }

    const ipv4Mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return ipv4Mapped ? isPrivateIpv4(ipv4Mapped[1] ?? '') : false;
  }

  return true;
}

/**
 * Prevent authenticated Secure Conversations features from becoming an SSRF
 * primitive. Every discovery URL and every stored outbound endpoint is checked
 * immediately before network access so DNS changes cannot bypass registration
 * time validation.
 */
@Injectable()
export class OutboundUrlValidatorService {
  private readonly allowPrivateNetworks: boolean;

  constructor(private readonly config: ConfigService) {
    this.allowPrivateNetworks =
      this.config.get<string>(
        'SECURE_CONVERSATIONS_ALLOW_PRIVATE_NETWORKS',
        'false',
      ) === 'true';
  }

  async assertSafe(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('External agent URL must be a valid URL');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new BadRequestException(
        'External agent URL must use HTTP or HTTPS',
      );
    }

    if (url.username || url.password) {
      throw new BadRequestException(
        'External agent URL must not contain credentials',
      );
    }

    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '');
    if (
      BLOCKED_HOSTNAMES.has(hostname) ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      this.rejectPrivateNetwork();
    }

    if (this.allowPrivateNetworks) {
      return url;
    }

    if (isIP(hostname) && isPrivateNetworkAddress(hostname)) {
      this.rejectPrivateNetwork();
    }

    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new BadRequestException('External agent hostname could not be resolved');
    }

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateNetworkAddress(address))
    ) {
      this.rejectPrivateNetwork();
    }

    return url;
  }

  private rejectPrivateNetwork(): never {
    throw new ServiceUnavailableException(
      'External agent URL resolves to a private or reserved network',
    );
  }
}

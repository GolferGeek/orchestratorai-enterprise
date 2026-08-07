import { ConfigService } from '@nestjs/config';
import {
  isPrivateNetworkAddress,
  OutboundUrlValidatorService,
} from './outbound-url-validator.service';

function config(allowPrivateNetworks: boolean): ConfigService {
  return {
    get: jest.fn((_key: string, fallback: string) =>
      allowPrivateNetworks ? 'true' : fallback,
    ),
  } as unknown as ConfigService;
}

describe('OutboundUrlValidatorService', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('recognizes private or reserved address %s', (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'recognizes public address %s',
    (address) => {
      expect(isPrivateNetworkAddress(address)).toBe(false);
    },
  );

  it.each([
    'file:///etc/passwd',
    'ftp://agent.example/file',
    'https://user:password@agent.example',
  ])('rejects unsafe URL form %s', async (url) => {
    await expect(
      new OutboundUrlValidatorService(config(false)).assertSafe(url),
    ).rejects.toThrow();
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]:3000',
  ])('blocks SSRF target %s by default', async (url) => {
    await expect(
      new OutboundUrlValidatorService(config(false)).assertSafe(url),
    ).rejects.toThrow('private or reserved network');
  });

  it('allows explicitly configured private-network development endpoints', async () => {
    await expect(
      new OutboundUrlValidatorService(config(true)).assertSafe(
        'http://127.0.0.1:7300/invoke',
      ),
    ).resolves.toBeInstanceOf(URL);
  });
});

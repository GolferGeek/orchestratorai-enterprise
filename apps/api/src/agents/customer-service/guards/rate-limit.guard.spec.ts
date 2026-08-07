import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { RateLimitGuard, getClientIp } from './rate-limit.guard';

function nestContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard hardening', () => {
  it('fails closed when a client address cannot be determined', () => {
    const guard = new RateLimitGuard();
    const context = nestContext({
      path: '/speech/synthesize',
      headers: { authorization: 'Bearer token' },
      body: { text: 'hello' },
      socket: {},
    });

    expect(() => guard.canActivate(context)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('uses Express trusted-proxy resolution instead of trusting a raw forwarded header', () => {
    expect(
      getClientIp({
        ip: '203.0.113.25',
        headers: { 'x-forwarded-for': '198.51.100.99' },
        socket: { remoteAddress: '127.0.0.1' },
      } as never),
    ).toBe('203.0.113.25');
  });

  it('rejects speech requests without GuestSession or Bearer authorization', () => {
    const guard = new RateLimitGuard();
    const context = nestContext({
      path: '/speech/transcribe',
      headers: {},
      body: {},
      ip: '203.0.113.25',
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });
});

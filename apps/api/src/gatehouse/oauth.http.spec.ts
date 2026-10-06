/**
 * The OAuth endpoints over real HTTP with the API's global settings
 * (configureApplication: ValidationPipe with forbidNonWhitelisted, the form
 * body parser). Unit tests call the service directly and once missed that the
 * pipe rejected every query parameter of /authorize.
 */
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { CONFIG_PROVIDER_SERVICE } from '@orchestratorai/planes/config';
import { configureApplication } from '../app-bootstrap';
import { GatehouseOAuthController } from './oauth.controller';
import { GatehouseOAuthService } from './oauth.service';

describe('the OAuth endpoints over HTTP', () => {
  let app: INestApplication;
  let base: string;
  const oauth = { token: jest.fn(), register: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GatehouseOAuthController],
      providers: [
        { provide: GatehouseOAuthService, useValue: oauth },
        { provide: CONFIG_PROVIDER_SERVICE, useValue: { getRequired: (key: string) => ({ PUBLIC_WEB_URL: 'https://company.example' })[key] } },
      ],
    }).compile();
    const express = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApplication(express);
    app = express;
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(() => app.close());

  it('sends the person from /authorize to the consent page with every parameter', async () => {
    const response = await fetch(`${base}/gatehouse/oauth/authorize?client_id=oac_1&response_type=code&code_challenge=abc&state=s1`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://company.example/connect?client_id=oac_1&response_type=code&code_challenge=abc&state=s1');
  });

  it('takes a form-encoded token request and answers with no-store', async () => {
    oauth.token.mockResolvedValue({ ok: true, body: { access_token: 'oak_x', token_type: 'Bearer' } });
    const response = await fetch(`${base}/gatehouse/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=oaa_1&code_verifier=v',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ access_token: 'oak_x', token_type: 'Bearer' });
    expect(oauth.token).toHaveBeenCalledWith({ grant_type: 'authorization_code', code: 'oaa_1', code_verifier: 'v' });
  });

  it('answers a refused token request in OAuth form, with its status', async () => {
    oauth.token.mockResolvedValue({ ok: false, status: 400, error: 'invalid_grant', error_description: 'used' });
    const response = await fetch(`${base}/gatehouse/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'x' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_grant', error_description: 'used' });
  });
});

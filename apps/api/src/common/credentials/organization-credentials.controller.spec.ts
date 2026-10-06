import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrganizationCredentialsController } from './organization-credentials.controller';
import type { OrganizationCredentialsService } from './organization-credentials.service';

describe('OrganizationCredentialsController', () => {
  function setup() {
    const service = {
      list: jest.fn(async () => []),
      put: jest.fn(async () => undefined),
      remove: jest.fn(async () => true),
    };
    return { service, controller: new OrganizationCredentialsController(service as unknown as OrganizationCredentialsService) };
  }

  it('stores a value for the organization the RBAC guard checked', async () => {
    const { service, controller } = setup();
    await controller.put({ organizationSlug: 'acme' }, 'shipstation', 'api_key', { value: 'secret', metadata: { environment: 'sandbox' } });
    expect(service.put).toHaveBeenCalledWith({ organizationSlug: 'acme', type: 'shipstation', key: 'api_key' }, 'secret', { environment: 'sandbox' });
  });

  it.each([
    ['all organizations', { organizationSlug: '*' }, { value: 'secret' }],
    ['no organization', {}, { value: 'secret' }],
    ['an empty value', { organizationSlug: 'acme' }, { value: '' }],
    ['metadata that is not an object', { organizationSlug: 'acme' }, { value: 'secret', metadata: ['x'] }],
  ])('refuses %s', async (_label, request, body) => {
    const { service, controller } = setup();
    await expect(controller.put(request, 'shipstation', 'api_key', body)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.put).not.toHaveBeenCalled();
  });

  it('answers 404 for removing a credential that is not there', async () => {
    const { service, controller } = setup();
    service.remove.mockResolvedValueOnce(false);
    await expect(controller.remove({ organizationSlug: 'acme' }, 'shipstation', 'api_key')).rejects.toBeInstanceOf(NotFoundException);
  });
});

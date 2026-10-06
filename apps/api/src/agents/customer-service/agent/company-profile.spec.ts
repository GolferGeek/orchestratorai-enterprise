import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { CompanyProfileLoader, CustomerServiceNotConfiguredException, parseCompanyProfile } from './company-profile';

describe('parseCompanyProfile', () => {
  it('reads the name and every contact detail', () => {
    expect(
      parseCompanyProfile('acme', {
        name: 'Acme Labs',
        settings: {
          other: true,
          customerService: {
            email: 'help@acme.test',
            phone: '+1 555 0100',
            bookingUrl: 'https://acme.test/book',
          },
        },
      }),
    ).toEqual({
      orgSlug: 'acme',
      name: 'Acme Labs',
      contact: {
        email: 'help@acme.test',
        phone: '+1 555 0100',
        bookingUrl: 'https://acme.test/book',
      },
    });
  });

  it('leaves optional phone and bookingUrl out when they are not set', () => {
    const profile = parseCompanyProfile('acme', {
      name: 'Acme Labs',
      settings: { customerService: { email: 'help@acme.test' } },
    });
    expect(profile.contact).toEqual({ email: 'help@acme.test' });
    expect('phone' in profile.contact).toBe(false);
    expect('bookingUrl' in profile.contact).toBe(false);
  });

  it('throws when the organization does not exist', () => {
    expect(() => parseCompanyProfile('ghost', null)).toThrow(
      "Customer service cannot speak for organization 'ghost': the organization does not exist",
    );
  });

  it('throws when settings.customerService is missing', () => {
    expect(() =>
      parseCompanyProfile('acme', { name: 'Acme Labs', settings: {} }),
    ).toThrow('settings.customerService is missing');
    expect(() =>
      parseCompanyProfile('acme', { name: 'Acme Labs', settings: null }),
    ).toThrow('the organization has no settings object');
  });

  it('throws when the email is missing', () => {
    expect(() =>
      parseCompanyProfile('acme', {
        name: 'Acme Labs',
        settings: { customerService: { phone: '555' } },
      }),
    ).toThrow('settings.customerService.email is missing');
  });

  it.each([
    [{ email: 42 }, 'settings.customerService.email must be an email address'],
    [{ email: 'not-an-email' }, 'settings.customerService.email must be an email address'],
    [{ email: 'a@b.test', phone: 5550100 }, 'settings.customerService.phone must be a non-empty string'],
    [{ email: 'a@b.test', phone: '' }, 'settings.customerService.phone must be a non-empty string'],
    [{ email: 'a@b.test', bookingUrl: null }, 'settings.customerService.bookingUrl must be a non-empty string'],
    [{ email: 'a@b.test', bookingUrl: 'acme.test/book' }, 'settings.customerService.bookingUrl must be an http(s) URL'],
    [{ email: 'a@b.test', bookingURL: 'https://acme.test' }, 'settings.customerService has unknown keys: bookingURL'],
    ['help@acme.test', 'settings.customerService must be an object'],
  ])('rejects the wrong shape %p', (customerService, message) => {
    expect(() =>
      parseCompanyProfile('acme', {
        name: 'Acme Labs',
        settings: { customerService },
      }),
    ).toThrow(message);
  });

  it('throws when the organization has no name', () => {
    expect(() =>
      parseCompanyProfile('acme', {
        name: '  ',
        settings: { customerService: { email: 'a@b.test' } },
      }),
    ).toThrow('the organization has no name');
  });
});

describe('CompanyProfileLoader', () => {
  function fakeDb(result: { data: unknown; error: { message: string } | null }) {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    return { db: { from }, from, select, eq };
  }

  it("loads the row for the context's organization", async () => {
    const { db, from, select, eq } = fakeDb({
      data: {
        name: 'Acme Labs',
        settings: { customerService: { email: 'help@acme.test' } },
      },
      error: null,
    });
    const loader = new CompanyProfileLoader(db as never);

    const profile = await loader.load(
      createMockExecutionContext({ orgSlug: 'acme' }),
    );

    expect(from).toHaveBeenCalledWith(null, 'organizations');
    expect(select).toHaveBeenCalledWith('name, settings');
    expect(eq).toHaveBeenCalledWith('slug', 'acme');
    expect(profile.name).toBe('Acme Labs');
  });

  it('throws when the organization row is missing', async () => {
    const { db } = fakeDb({ data: null, error: null });
    const loader = new CompanyProfileLoader(db as never);
    await expect(
      loader.load(createMockExecutionContext({ orgSlug: 'ghost' })),
    ).rejects.toThrow('the organization does not exist');
  });

  it('propagates a database error', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'boom' } });
    const loader = new CompanyProfileLoader(db as never);
    await expect(
      loader.load(createMockExecutionContext({ orgSlug: 'acme' })),
    ).rejects.toThrow("Failed to load organization 'acme' for customer service: boom");
  });
});

describe('customer service not set up', () => {
  it('tells the guest plainly (503, a code), and keeps the detail for whoever fixes it', () => {
    let error: unknown;
    try {
      parseCompanyProfile('marketing', { name: 'Marketing', settings: {} });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CustomerServiceNotConfiguredException);
    const exception = error as CustomerServiceNotConfiguredException;
    expect(exception.getStatus()).toBe(503);
    expect(exception.getResponse()).toEqual({
      statusCode: 503,
      code: 'customer_service_not_configured',
      message: "This organization hasn't set up customer service yet.",
    });
    expect(exception.message).toContain("organization 'marketing': settings.customerService is missing");
  });
});

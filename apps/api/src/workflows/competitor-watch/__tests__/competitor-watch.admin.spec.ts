import { competitorWatchAdminSections } from '../competitor-watch.admin';

describe('competitor watch admin', () => {
  const store = {
    list: jest.fn(async () => [{ id: 'a', competitor: 'Acme', page: 'Pricing', url: 'https://acme.io/pricing', enabled: true }]),
    add: jest.fn(async (_org: string, s: object) => ({ id: 'b', ...s })),
    update: jest.fn(async () => null),
    remove: jest.fn(async () => true),
  };
  const [pages] = competitorWatchAdminSections(store as never);
  const row = { competitor: 'Acme', page: 'Pricing', url: 'https://acme.io/pricing', enabled: false };

  it('adds a page, disabled or not, and only over https', async () => {
    expect(await pages!.create!('marketing', row, 'u')).toMatchObject({ id: 'b', enabled: false });
    expect(store.add).toHaveBeenCalledWith('marketing', row, 'u');
    await expect(pages!.create!('marketing', { ...row, url: 'http://acme.io' }, 'u')).rejects.toThrow(/https/);
  });

  it('refuses a page that is not there', async () => {
    await expect(pages!.update!('marketing', '11111111-1111-4111-8111-111111111111', row, 'u')).rejects.toThrow(/No page/);
    await expect(pages!.update!('marketing', 'not-an-id', row, 'u')).rejects.toThrow(/No page/);
    expect(await pages!.remove!('marketing', 'not-an-id')).toBe(false);
  });
});

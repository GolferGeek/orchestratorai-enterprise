/**
 * 00 — Prerequisites
 *
 * Verify infrastructure is reachable before running platform tests.
 * If these fail, nothing else will work.
 */
import { requireSupabase, requireService } from './helpers/service-check';

describe('Prerequisites', () => {
  it('Supabase REST is reachable on port 54321', async () => {
    await requireSupabase();
  });

  it('Platform API is reachable on port 6700', async () => {
    await requireService('platform');
  });

  it('DATABASE_URL environment variable is set', () => {
    expect(process.env['DATABASE_URL']).toBeTruthy();
  });
});

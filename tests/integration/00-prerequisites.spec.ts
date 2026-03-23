/**
 * 00 — Prerequisites
 *
 * Verify infrastructure is reachable before running any product tests.
 * If these fail, nothing else will work.
 */
import { requireSupabase, requireService } from './helpers/service-check';

describe('Prerequisites', () => {
  it('Supabase REST is reachable on port 54321', async () => {
    await requireSupabase();
  });

  it('Auth API is reachable on port 6100', async () => {
    await requireService('auth');
  });

  it('DATABASE_URL environment variable is set', () => {
    expect(process.env['DATABASE_URL']).toBeTruthy();
  });
});

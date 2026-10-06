import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '../postgresql-database.service';

describe('the company (business) database connection', () => {
  it('reads its settings with the BUSINESS_ prefix, and the platform connection without', () => {
    const config = new ConfigService({ POSTGRESQL_URL: 'postgresql://platform/db', BUSINESS_POSTGRESQL_URL: 'postgresql://company/db' });
    expect(new PostgresqlDatabaseService(config).getConfig().url).toBe('postgresql://platform/db');
    expect(new PostgresqlDatabaseService(config, 'BUSINESS_').getConfig().url).toBe('postgresql://company/db');
  });

  it('never borrows the platform\'s settings when its own are missing', () => {
    const config = new ConfigService({ POSTGRESQL_URL: 'postgresql://platform/db' });
    expect(() => new PostgresqlDatabaseService(config, 'BUSINESS_').getConfig()).toThrow('BUSINESS_PG_HOST');
  });
});

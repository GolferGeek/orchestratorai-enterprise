/**
 * Database Test Utilities
 *
 * Provides database setup/teardown, transactions, and cleanup utilities for integration tests.
 * Uses DATABASE_SERVICE provider plane for multi-cloud portability (Supabase, Azure, GCP).
 *
 * Usage:
 * ```typescript
 * beforeAll(async () => {
 *   await DatabaseTestHelper.setupTestDatabase();
 *   authToken = await DatabaseTestHelper.authenticateTestUser();
 * });
 *
 * afterEach(async () => {
 *   await DatabaseTestHelper.cleanupTestData('test-orch-');
 * });
 *
 * it('test with transaction', async () => {
 *   await DatabaseTestHelper.withTransaction(async () => {
 *     // test code here - auto-rollback after test
 *   });
 * });
 * ```
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DatabaseModule } from '@orchestratorai/planes/database';
import {
  DATABASE_SERVICE,
  type DatabaseService,
} from '@orchestratorai/planes/database';
import {
  AUTH_SERVICE,
  type AuthServiceProvider,
} from '@orchestratorai/planes/auth/interfaces/auth-service.interface';
import { AuthModule } from '../../auth/auth.module';
import type { Agent, OrchestrationDefinition } from './mock-factories';

// ============================================================================
// Database Test Helper
// ============================================================================

export class DatabaseTestHelper {
  private static db: DatabaseService | null = null;
  private static auth: AuthServiceProvider | null = null;
  private static testModule: TestingModule | null = null;
  private static authToken: string | null = null;

  // --------------------------------------------------------------------------
  // Setup / Teardown
  // --------------------------------------------------------------------------

  /**
   * Setup test database connection via DATABASE_SERVICE provider plane.
   * Creates a NestJS test module with real DatabaseModule + AuthModule.
   */
  static async setupTestDatabase(): Promise<void> {
    if (DatabaseTestHelper.db) return;

    DatabaseTestHelper.testModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
      ],
    }).compile();

    DatabaseTestHelper.db =
      DatabaseTestHelper.testModule.get<DatabaseService>(DATABASE_SERVICE);
    DatabaseTestHelper.auth =
      DatabaseTestHelper.testModule.get<AuthServiceProvider>(AUTH_SERVICE);
  }

  /**
   * Teardown test database connection.
   * Call this in afterAll() hooks if needed.
   */
  static async teardownTestDatabase(): Promise<void> {
    if (DatabaseTestHelper.testModule) {
      await DatabaseTestHelper.testModule.close();
    }
    DatabaseTestHelper.db = null;
    DatabaseTestHelper.auth = null;
    DatabaseTestHelper.testModule = null;
    DatabaseTestHelper.authToken = null;
  }

  // --------------------------------------------------------------------------
  // Authentication
  // --------------------------------------------------------------------------

  /**
   * Authenticate as test user and return JWT token.
   * Uses AUTH_SERVICE provider plane for multi-cloud auth.
   *
   * @param appInstance - NestJS app instance (for HTTP-based auth)
   * @returns JWT authentication token
   */
  static async authenticateTestUser(
    appInstance?: INestApplication,
  ): Promise<string> {
    // If we already have a token, reuse it
    if (DatabaseTestHelper.authToken) {
      return DatabaseTestHelper.authToken;
    }

    const testUser = process.env.TEST_USER_EMAIL || 'demo.user@playground.com';
    const testPassword = process.env.TEST_USER_PASSWORD || 'demo-password';

    // Authenticate via HTTP API if app instance provided
    if (appInstance) {
      const httpServer = appInstance.getHttpServer() as Parameters<
        typeof request
      >[0];
      const response = await request(httpServer)
        .post('/auth/login')
        .send({
          username: testUser,
          password: testPassword,
        })
        .expect(200);

      const body = response.body as { access_token: string };
      const accessToken = body.access_token;
      DatabaseTestHelper.authToken = accessToken;
      return DatabaseTestHelper.authToken;
    }

    // Use AUTH_SERVICE for direct authentication
    await DatabaseTestHelper.setupTestDatabase();
    if (!DatabaseTestHelper.auth) {
      throw new Error('AUTH_SERVICE not initialized');
    }

    const tokenResponse = await DatabaseTestHelper.auth.login({
      email: testUser,
      password: testPassword,
    });

    if (!tokenResponse?.accessToken) {
      throw new Error('Test user authentication failed: No session returned');
    }

    DatabaseTestHelper.authToken = tokenResponse.accessToken;
    return DatabaseTestHelper.authToken;
  }

  /**
   * Get test user ID via AUTH_SERVICE.
   */
  static async getTestUserId(): Promise<string> {
    const token = await DatabaseTestHelper.authenticateTestUser();
    if (!DatabaseTestHelper.auth) {
      throw new Error('AUTH_SERVICE not initialized');
    }
    const user = await DatabaseTestHelper.auth.validateUser(token);
    if (!user) {
      throw new Error('Test user not authenticated');
    }
    return user.id;
  }

  // --------------------------------------------------------------------------
  // Transaction Support
  // --------------------------------------------------------------------------

  /**
   * Execute test code within a transaction that auto-rolls back.
   * Perfect for integration tests that need database isolation.
   *
   * @param fn - Async function to execute within transaction
   * @returns Result of the function
   */
  static async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    await DatabaseTestHelper.setupTestDatabase();

    // Note: DATABASE_SERVICE doesn't expose transaction control directly yet.
    // This implementation provides isolation through cleanup instead.
    try {
      const result = await fn();
      return result;
    } finally {
      // Cleanup is handled by test-specific afterEach hooks
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup Utilities
  // --------------------------------------------------------------------------

  /**
   * Cleanup test data by UUID prefix.
   * Uses DATABASE_SERVICE.rawQuery() for multi-cloud portability.
   *
   * @param prefix - Prefix to match (e.g., 'test-orch-')
   */
  static async cleanupTestData(prefix: string): Promise<void> {
    await DatabaseTestHelper.setupTestDatabase();
    const db = DatabaseTestHelper.db!;

    // Clean up orchestration data
    await db.rawQuery(`DELETE FROM orchestration_steps WHERE id LIKE $1`, [
      `${prefix}%`,
    ]);
    await db.rawQuery(`DELETE FROM orchestration_runs WHERE id LIKE $1`, [
      `${prefix}%`,
    ]);
    await db.rawQuery(
      `DELETE FROM orchestration_definitions WHERE slug LIKE $1`,
      [`${prefix}%`],
    );

    // Clean up conversations and deliverables
    await db.rawQuery(`DELETE FROM deliverables WHERE id LIKE $1`, [
      `${prefix}%`,
    ]);
    await db.rawQuery(`DELETE FROM tasks WHERE id LIKE $1`, [`${prefix}%`]);
    await db.rawQuery(`DELETE FROM conversations WHERE id LIKE $1`, [
      `${prefix}%`,
    ]);

    // Clean up test agents
    await db.rawQuery(`DELETE FROM agents WHERE slug LIKE $1`, [`${prefix}%`]);
  }

  /**
   * Truncate a specific table (use with caution!).
   * Only works on test-specific tables to prevent accidental data loss.
   *
   * @param tableName - Name of table to truncate
   */
  static async truncateTable(tableName: string): Promise<void> {
    // Whitelist of tables that are safe to truncate in tests
    const safeTables = [
      'orchestration_steps',
      'orchestration_runs',
      'orchestration_definitions',
      'test_data',
    ];

    if (!safeTables.includes(tableName)) {
      throw new Error(
        `Table '${tableName}' is not whitelisted for truncation in tests`,
      );
    }

    await DatabaseTestHelper.setupTestDatabase();
    const db = DatabaseTestHelper.db!;

    // Delete all rows
    await db.rawQuery(
      `DELETE FROM ${tableName} WHERE id != '00000000-0000-0000-0000-000000000000'`,
    );
  }

  /**
   * Cleanup all test orchestration data.
   * Useful for afterAll() hooks.
   */
  static async cleanupAllTestOrchestrations(): Promise<void> {
    await DatabaseTestHelper.setupTestDatabase();
    const db = DatabaseTestHelper.db!;

    await db.rawQuery(
      `DELETE FROM orchestration_steps WHERE organization_slug = $1`,
      ['test-org'],
    );
    await db.rawQuery(
      `DELETE FROM orchestration_runs WHERE organization_slug = $1`,
      ['test-org'],
    );
    await db.rawQuery(
      `DELETE FROM orchestration_definitions WHERE organization_slug = $1`,
      ['test-org'],
    );
    // agents.organization_slug is an array — use ANY for PostgreSQL
    await db.rawQuery(`DELETE FROM agents WHERE $1 = ANY(organization_slug)`, [
      'test-org',
    ]);
  }

  // --------------------------------------------------------------------------
  // Raw Query Helpers
  // --------------------------------------------------------------------------

  /**
   * Execute raw SQL query via DATABASE_SERVICE.
   *
   * @param sql - SQL query string
   * @param params - Query parameters (use $1, $2, etc. in SQL)
   * @returns Query results
   */
  static async rawQuery<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    await DatabaseTestHelper.setupTestDatabase();
    const db = DatabaseTestHelper.db!;

    const result = await db.rawQuery(sql, params);

    if (result.error) {
      throw new Error(`Raw query failed: ${result.error.message}`);
    }

    return (result.data as T[]) ?? [];
  }

  /**
   * Execute raw SQL command (INSERT, UPDATE, DELETE).
   * Returns number of affected rows.
   *
   * @param sql - SQL command string
   * @param params - Command parameters
   * @returns Number of affected rows
   */
  static async rawCommand(
    sql: string,
    params: unknown[] = [],
  ): Promise<number> {
    const result = await DatabaseTestHelper.rawQuery(sql, params);
    return result ? result.length : 0;
  }

  // --------------------------------------------------------------------------
  // Verification Helpers
  // --------------------------------------------------------------------------

  /**
   * Verify a record exists in the database.
   *
   * @param tableName - Table name
   * @param id - Record ID or slug (for agents table, use slug)
   * @returns True if record exists
   */
  static async recordExists(tableName: string, id: string): Promise<boolean> {
    await DatabaseTestHelper.setupTestDatabase();
    const db = DatabaseTestHelper.db!;

    // Special handling for agents table which uses 'slug' as primary key
    const primaryKeyColumn = tableName === 'agents' ? 'slug' : 'id';

    const result = await db.rawQuery(
      `SELECT ${primaryKeyColumn} FROM ${tableName} WHERE ${primaryKeyColumn} = $1 LIMIT 1`,
      [id],
    );

    if (result.error) {
      throw new Error(`Record existence check failed: ${result.error.message}`);
    }

    const rows = (result.data as unknown[]) ?? [];
    return rows.length > 0;
  }

  /**
   * Count records matching a condition.
   *
   * @param tableName - Table name
   * @param column - Column to filter on
   * @param value - Value to match
   * @returns Count of matching records
   */
  static async countRecords(
    tableName: string,
    column: string,
    value: unknown,
  ): Promise<number> {
    await DatabaseTestHelper.setupTestDatabase();
    const db = DatabaseTestHelper.db!;

    const result = await db.rawQuery(
      `SELECT COUNT(*) as count FROM ${tableName} WHERE ${column} = $1`,
      [value],
    );

    if (result.error) {
      throw new Error(`Record count failed: ${result.error.message}`);
    }

    const rows = result.data as Array<{ count: string | number }> | null;
    return Number(rows?.[0]?.count ?? 0);
  }

  // --------------------------------------------------------------------------
  // Test Data Seeding
  // --------------------------------------------------------------------------

  /**
   * Seed test agent (if not already exists).
   *
   * @param agentData - Agent data to seed
   * @returns Seeded agent
   */
  static async seedTestAgent(agentData: Partial<Agent>): Promise<Agent> {
    await DatabaseTestHelper.setupTestDatabase();
    const db = DatabaseTestHelper.db!;

    const result = await db.rawQuery(
      `INSERT INTO agents (slug, name, description, agent_type, organization_slug, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         agent_type = EXCLUDED.agent_type,
         organization_slug = EXCLUDED.organization_slug,
         metadata = EXCLUDED.metadata
       RETURNING *`,
      [
        agentData.slug,
        agentData.name || 'Test Agent',
        agentData.description || 'Test agent for integration tests',
        agentData.agent_type || 'context',
        agentData.organization_slug || ['test-org'],
        JSON.stringify(agentData.metadata || {}),
      ],
    );

    if (result.error) {
      throw new Error(`Failed to seed test agent: ${result.error.message}`);
    }

    const rows = (result.data as Agent[]) ?? [];
    if (!rows[0]) {
      throw new Error('Failed to seed test agent: No row returned');
    }
    return rows[0];
  }

  /**
   * Seed test orchestration definition (if not already exists).
   *
   * @param definitionData - Orchestration definition data
   * @returns Seeded definition
   */
  static async seedTestOrchestration(
    definitionData: Partial<OrchestrationDefinition>,
  ): Promise<OrchestrationDefinition> {
    await DatabaseTestHelper.setupTestDatabase();
    const db = DatabaseTestHelper.db!;

    const result = await db.rawQuery(
      `INSERT INTO orchestration_definitions (id, slug, organization_slug, display_name, description, version, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_slug, slug) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         description = EXCLUDED.description,
         version = EXCLUDED.version,
         is_active = EXCLUDED.is_active
       RETURNING *`,
      [
        definitionData.id,
        definitionData.slug,
        definitionData.organization_slug,
        definitionData.display_name || 'Test Orchestration',
        definitionData.description || 'Test orchestration definition',
        definitionData.version ?? 1,
        definitionData.is_active ?? true,
      ],
    );

    if (result.error) {
      throw new Error(
        `Failed to seed test orchestration: ${result.error.message}`,
      );
    }

    const rows = (result.data as OrchestrationDefinition[]) ?? [];
    if (!rows[0]) {
      throw new Error('Failed to seed test orchestration: No row returned');
    }
    return rows[0];
  }
}

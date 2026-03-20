/**
 * Global test setup for agent-communication apps.
 *
 * Loaded via Jest's globalSetup or setupFiles configuration.
 * Sets NODE_ENV and configures default test timeouts.
 */

process.env['NODE_ENV'] = 'test';

// Default timeout for async operations in unit tests.
// E2E tests override this via jest-e2e.json testTimeout.
jest.setTimeout(10000);

/**
 * Jest setup file to load environment variables from root .env
 * This ensures E2E tests have access to proper test credentials
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load root .env file (5 levels up from testing/test to apps/)
// Resolves to: apps/.env which contains all product API URLs
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

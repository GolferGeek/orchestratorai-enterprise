/**
 * Jest setup file to load environment variables from root .env
 * This ensures E2E tests have access to proper test credentials
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

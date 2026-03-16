// Test Setup — Command Web
import { beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

process.env.VITE_ENFORCE_HTTPS = 'false';
process.env.NODE_ENV = 'test';

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  setActivePinia(undefined);
});

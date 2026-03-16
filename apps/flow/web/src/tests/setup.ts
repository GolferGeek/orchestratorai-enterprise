// Test Setup — Flow Web
import { beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

process.env.NODE_ENV = 'test';

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  setActivePinia(undefined);
});

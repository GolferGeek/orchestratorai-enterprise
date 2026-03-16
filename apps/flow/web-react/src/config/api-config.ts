function readEnv(name: string): string | undefined {
  const value = import.meta.env[name];
  if (!value || value.trim() === '') {
    return undefined;
  }
  return value;
}

export function getMainApiUrl(): string {
  const mainApiUrl = readEnv('VITE_MAIN_API_URL') || readEnv('MAIN_API_URL');
  if (!mainApiUrl) {
    throw new Error(
      'VITE_MAIN_API_URL or MAIN_API_URL environment variable is required',
    );
  }
  return mainApiUrl;
}

export function getLocalApiUrl(): string {
  const localApiUrl = readEnv('VITE_API_URL');
  if (!localApiUrl) {
    throw new Error('VITE_API_URL environment variable is required');
  }
  return localApiUrl;
}

export function isLocalRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  const isBrowserLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  let isConfiguredApiLocal = false;
  try {
    const mainApiUrl = getMainApiUrl();
    isConfiguredApiLocal =
      mainApiUrl.includes('localhost') || mainApiUrl.includes('127.0.0.1');
  } catch {
    isConfiguredApiLocal = false;
  }

  return isBrowserLocal || isConfiguredApiLocal;
}

export function getAuthApiUrl(): string {
  return isLocalRuntime() ? getLocalApiUrl() : getMainApiUrl();
}

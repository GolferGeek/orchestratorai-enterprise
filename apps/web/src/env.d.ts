/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_AUTH_PROVIDER?: string;
  readonly VITE_DEMO_USER_EMAIL?: string;
  readonly VITE_DEMO_USER_PASSWORD?: string;
  readonly VITE_PLATFORM_WEB_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

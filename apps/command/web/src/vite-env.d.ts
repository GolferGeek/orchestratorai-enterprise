/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_PROVIDER?: string;
  readonly VITE_CONFIG_PROVIDER?: string;
  readonly VITE_DB_PROVIDER?: string;
  readonly VITE_STORAGE_PROVIDER?: string;
  readonly VITE_WORK_PROVIDER?: string;
  readonly VITE_KNOWLEDGE_PROVIDER?: string;

  readonly VITE_LANDING_WEB_URL?: string;

  readonly VITE_AZURE_CLIENT_ID?: string;
  readonly VITE_AZURE_TENANT_ID?: string;
  readonly VITE_AZURE_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

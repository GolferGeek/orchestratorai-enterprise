/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COMMAND_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

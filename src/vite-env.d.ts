/// <reference types="vite/client" />

// (optional) declare the vars you actually use for better intellisense
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // add more: readonly VITE_SOMETHING?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

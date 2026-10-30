/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PIN de 4 dígitos para entrar como admin (bloqueo suave, no es auth real). */
  readonly VITE_ADMIN_PIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
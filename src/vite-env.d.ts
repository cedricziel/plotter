/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PMTILES_URL?: string;
  readonly VITE_GLYPHS_URL?: string;
}
declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

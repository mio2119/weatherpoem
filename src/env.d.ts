/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __RELEASE_CHANNEL__: "trial" | "production";

interface ImportMetaEnv {
  readonly VITE_WEATHER_TIMEOUT_MS?: string;
  readonly VITE_WARNING_API_URL?: string;
  readonly VITE_WARNING_TIMEOUT_MS?: string;
  readonly VITE_CONTENT_CONTROL_URL?: string;
  readonly VITE_CONTENT_CONTROL_TIMEOUT_MS?: string;
  readonly VITE_REASON_API_URL?: string;
  readonly VITE_REASON_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __TAURI_INTERNALS__?: unknown;
}

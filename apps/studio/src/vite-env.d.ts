/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the OpenSpace Hub. Defaults to http://localhost:8787. */
  readonly VITE_HUB_URL?: string;
  /** "1" selects the in-memory mock Hub (no Hub process needed). */
  readonly VITE_MOCK_API?: string;
  /** Optional marketing site URL; signed-out visitors to "/" go there when set. */
  readonly VITE_MARKETING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

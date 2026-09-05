/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Set by the Dockerfile's build stage (Unix seconds); unset in local dev.
  // See server/src/version.ts for the server-side equivalent.
  readonly VITE_BUILD_TIMESTAMP?: string
}

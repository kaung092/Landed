import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-source dirs eslint should never walk. `caddy/` is root-owned (reverse-proxy
    // runtime state) and errors the whole run with EACCES if scanned; `data/` holds the
    // SQLite DB and generated assets. Neither contains lintable source.
    "caddy/**",
    "data/**",
  ]),
]);

export default eslintConfig;

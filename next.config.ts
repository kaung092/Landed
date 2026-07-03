import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — keep it external, don't bundle it.
  serverExternalPackages: ["better-sqlite3"],
  // Allow the dev server to be reached via the local landed.ai domain (Caddy reverse-proxies
  // landed.ai:443 → localhost:3000). Next's dev cross-origin guard blocks data requests from any
  // host not listed here, which looks like "the app loads but no data".
  allowedDevOrigins: ["landed.ai", "jobhunt.com"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — keep it external, don't bundle it.
  serverExternalPackages: ["better-sqlite3"],
  // Allow the dev server to be reached via the local jobhunt.com domain
  // (Caddy reverse-proxies jobhunt.com:80 → localhost:3000).
  allowedDevOrigins: ["jobhunt.com"],
};

export default nextConfig;

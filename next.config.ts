import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "pdfkit"],
  experimental: {
    // Prevent Next.js HMR cache from serving stale fetch responses across
    // hot-reloads — belt-and-suspenders alongside the node:https Connection:close fix.
    serverComponentsHmrCache: false,
  },
};

export default nextConfig;

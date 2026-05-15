import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "pdfkit"],
  experimental: {
    // Prevent Next.js HMR cache from serving stale fetch responses across
    // hot-reloads — belt-and-suspenders alongside the node:https Connection:close fix.
    serverComponentsHmrCache: false,
  },
};

export default withNextIntl(nextConfig);

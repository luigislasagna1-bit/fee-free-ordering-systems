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
  images: {
    // Whitelist the hosts we accept user-uploaded images from. Without this
    // entry, /_next/image returns 400 INVALID_IMAGE_OPTIMIZE_REQUEST for any
    // external source — which is what was breaking logos + banners on the
    // hosted marketing pages. Vercel Blob's hostname is per-store
    // (e.g. <store-id>.public.blob.vercel-storage.com), so a wildcard
    // covers any blob bucket we provision.
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "**.blob.vercel-storage.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
